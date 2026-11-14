// NEAR AI Cloud attestation checks that need no network and no Intel collateral.
// Spec: https://docs.near.ai/cloud/verification/reference/quote-nonce-signer
//
// These checks bind a report to the client nonce, the signing identity and the measured configuration.
// They are only meaningful once the quote itself has been verified by an Intel DCAP verifier
// (server/scripts/verify-attestation.ts). Run on an unverified quote they prove internal consistency, nothing more.
import { sha256 } from '@noble/hashes/sha256';
import { sha384 } from '@noble/hashes/sha512';
import { concat, fromHex, toHex, utf8 } from '../near/bytes.js';

export interface EventLogEntry {
  imr: number;
  event_type: number;
  digest?: string;
  event?: string;
  event_payload?: string;
}

/** The fields of a NEAR AI report (gateway_attestation or one model_attestations[] candidate) that we read. */
export interface NearReport {
  model_name?: string;
  signing_address: string;
  signing_algo: string;
  request_nonce: string;
  intel_quote: string;
  event_log: string | EventLogEntry[];
  info: { tcb_info: string | { app_compose: string; [k: string]: unknown }; [k: string]: unknown };
  nvidia_payload?: string;
  tls_cert_fingerprint?: string;
}

/** Fields read from a TDX TD10 quote body. */
export interface QuoteFields {
  tdAttributes: Uint8Array;
  mrTd: Uint8Array;
  mrConfigId: Uint8Array;
  rtMr0: Uint8Array;
  rtMr1: Uint8Array;
  rtMr2: Uint8Array;
  rtMr3: Uint8Array;
  reportData: Uint8Array;
}

export interface CheckResult {
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
}

const TD_BODY_OFFSET = 48; // quote header
const TD_BODY_LEN = 584;

/** Parse a TDX v4 quote's TD report body WITHOUT verifying the quote. Use dcap-qvl's verified fields when available. */
export function parseTdxQuote(quote: Uint8Array): QuoteFields {
  if (quote.length < TD_BODY_OFFSET + TD_BODY_LEN) throw new Error('quote too short');
  const version = quote[0]! | (quote[1]! << 8);
  const teeType = quote[4]! | (quote[5]! << 8) | (quote[6]! << 16) | (quote[7]! << 24);
  if (version !== 4 || teeType !== 0x81) throw new Error(`not a TDX v4 quote (version ${version}, tee ${teeType})`);
  const b = quote.subarray(TD_BODY_OFFSET, TD_BODY_OFFSET + TD_BODY_LEN);
  return {
    tdAttributes: b.slice(120, 128),
    mrTd: b.slice(136, 184),
    mrConfigId: b.slice(184, 232),
    rtMr0: b.slice(328, 376),
    rtMr1: b.slice(376, 424),
    rtMr2: b.slice(424, 472),
    rtMr3: b.slice(472, 520),
    reportData: b.slice(520, 584),
  };
}

export function parseMaybeJson<T>(v: unknown): T {
  return (typeof v === 'string' ? JSON.parse(v) : v) as T;
}

function u32le(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

/** Replay the RTMR3 event log (only imr 3 events), per the NEAR AI reference helper. */
export function replayRtmr3(eventLog: string | EventLogEntry[]): Uint8Array {
  let rtmr3: Uint8Array = new Uint8Array(48);
  for (const ev of parseMaybeJson<EventLogEntry[]>(eventLog)) {
    if (ev.imr !== 3) continue;
    const digest = sha384(concat(u32le(ev.event_type), utf8(':'), utf8(ev.event ?? ''), utf8(':'), fromHex(ev.event_payload ?? '')));
    if (ev.digest && toHex(digest) !== ev.digest.toLowerCase()) throw new Error(`digest mismatch for event ${ev.event}`);
    rtmr3 = sha384(concat(rtmr3, digest));
  }
  return rtmr3;
}

/** Signing identity bytes from a report: 20-byte address for ecdsa, 32-byte public key for ed25519. */
export function signingIdentity(r: Pick<NearReport, 'signing_address' | 'signing_algo'>): Uint8Array {
  const id = fromHex(r.signing_address.replace(/^0x/i, ''));
  const want = r.signing_algo === 'ecdsa' ? 20 : r.signing_algo === 'ed25519' ? 32 : -1;
  if (id.length !== want) throw new Error('unsupported signing identity');
  return id;
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

/**
 * The quote, nonce, signer, debug, configuration and RTMR3 checks from the NEAR AI docs for one report.
 * `quote` should come from a quote that passed DCAP verification; the TCB status policy is applied by the caller.
 */
export function checkNearReport(report: NearReport, nonceHex: string, quote: QuoteFields): CheckResult {
  const checks: CheckResult['checks'] = [];
  const add = (name: string, fn: () => boolean | string) => {
    try {
      const r = fn();
      checks.push(r === true ? { name, ok: true } : { name, ok: false, detail: r === false ? 'failed' : r });
    } catch (e) {
      checks.push({ name, ok: false, detail: String(e instanceof Error ? e.message : e).slice(0, 200) });
    }
  };
  add('td_debug_off', () => (quote.tdAttributes[0]! & 1) === 0 || 'TDX debug mode is enabled');
  add('nonce_echo', () => report.request_nonce.toLowerCase() === nonceHex.toLowerCase() || 'echoed nonce differs from ours');
  add('report_data_binds_signer_and_nonce', () => {
    const id = signingIdentity(report);
    let bound: Uint8Array;
    if (report.tls_cert_fingerprint) bound = sha256(concat(id, fromHex(report.tls_cert_fingerprint)));
    else bound = concat(id, new Uint8Array(32 - id.length));
    const want = concat(bound, fromHex(nonceHex));
    return eq(quote.reportData, want) || 'quote report data does not bind signer and nonce';
  });
  add('mrconfigid_matches_app_compose', () => {
    const compose = parseMaybeJson<{ app_compose: string }>(report.info.tcb_info).app_compose;
    const want = concat(new Uint8Array([1]), sha256(utf8(compose)), new Uint8Array(15));
    return eq(quote.mrConfigId, want) || 'MRCONFIGID does not match sha256(app_compose)';
  });
  add('rtmr3_matches_event_log', () => eq(replayRtmr3(report.event_log), quote.rtMr3) || 'RTMR3 replay differs from quote');
  return { ok: checks.every((c) => c.ok), checks };
}

/** True when a hex nonce string is 32 random bytes (64 hex chars). */
export function isNonce(n: string): boolean {
  return /^[0-9a-f]{64}$/i.test(n);
}

export function randomNonce(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function normAddr(a: string): string {
  return a.toLowerCase().replace(/^0x/, '');
}

/** Case-insensitive comparison of (algo, address) pairs. */
export function sameSigner(a: { signing_address: string; signing_algo: string }, b: { signing_address: string; signing_algo: string }): boolean {
  return a.signing_algo === b.signing_algo && normAddr(a.signing_address) === normAddr(b.signing_address);
}
