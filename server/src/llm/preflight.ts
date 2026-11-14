// Attestation preflight: one request before completions fetches the gateway report and the NEAR model
// reports (docs: /cloud/verification/cloud-api/model-attestations). The signers it returns are the only
// identities a response signature may be matched against.
import { debug } from '../log.js';
import {
  checkNearReport,
  parseTdxQuote,
  randomNonce,
  type NearReport,
} from './attestation.js';
import { fromHex } from '../near/bytes.js';
import type { PreflightSigner } from './verify.js';

export interface Preflight {
  /** gateway signer (accepted when its quote is absent or passes the offline checks) */
  gateway: PreflightSigner | null;
  /** signers of model candidates that passed the offline nonce, signer, MRCONFIGID and RTMR3 checks */
  models: PreflightSigner[];
  /** model candidates returned vs. accepted, for diagnostics */
  candidates: number;
  /** set when the request itself failed */
  error?: string;
}

export const EMPTY_PREFLIGHT: Preflight = { gateway: null, models: [], candidates: 0 };

/** Offline binding checks on an (as yet DCAP-unverified) report. Never throws. */
export function offlineOk(report: NearReport, nonce: string): boolean {
  try {
    return checkNearReport(report, nonce, parseTdxQuote(fromHex(report.intel_quote))).ok;
  } catch (e) {
    debug('nearai', 'offline check failed', String(e));
    return false;
  }
}

export async function fetchPreflight(
  timedFetch: (url: string, init: RequestInit) => Promise<Response>,
  base: string,
  key: string,
  model: string,
  algo: string,
  nonceFn: () => string = randomNonce,
): Promise<Preflight> {
  try {
    const nonce = nonceFn();
    const q = new URLSearchParams({ model, provider: 'near', signing_algo: algo, include_tls_fingerprint: 'false', nonce });
    const res = await timedFetch(`${base}/attestation/report?${q}`, {
      headers: { accept: 'application/json', authorization: `Bearer ${key}`, 'x-no-aliasing': 'true' },
    });
    if (!res.ok) return { ...EMPTY_PREFLIGHT, error: `attestation HTTP ${res.status}` };
    const j: any = await res.json();
    const g = j?.gateway_attestation;
    let gateway: PreflightSigner | null = null;
    if (g?.signing_address && g?.signing_algo) {
      // Compatibility: a gateway report without a quote still identifies the signer; quoteVerified needs evidence anyway.
      if (!g.intel_quote || offlineOk(g as NearReport, nonce)) gateway = { signing_address: g.signing_address, signing_algo: g.signing_algo };
    }
    const cands: NearReport[] = Array.isArray(j?.model_attestations) ? j.model_attestations : [];
    const good = cands.filter((c) => c?.signing_algo === algo && c.signing_address && offlineOk(c, nonce));
    // Fail closed, as the docs require: if any returned candidate fails, no model signer is accepted.
    const models: PreflightSigner[] =
      good.length === cands.length ? good.map((c) => ({ signing_address: c.signing_address, signing_algo: c.signing_algo })) : [];
    return { gateway, models, candidates: cands.length };
  } catch (e) {
    debug('nearai', 'preflight failed', String(e));
    return { ...EMPTY_PREFLIGHT, error: String(e).slice(0, 120) };
  }
}
