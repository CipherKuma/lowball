// Full attestation verification run (Node only; NOT imported by the Worker).
// Per NEAR AI docs: https://docs.near.ai/cloud/verification/reference/quote-nonce-signer
//  1. Intel TDX quote: certificate chain, TCB status and collateral (Phala dcap-qvl, collateral from Intel/Phala PCCS)
//  2. debug off, nonce + signer in report_data, MRCONFIGID = sha256(app_compose), RTMR3 replay (attestation.ts)
//  3. NVIDIA GPU evidence: nonce match, NRAS verdict, and the verdict JWT's signature against NVIDIA's JWKS
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { checkNearReport, parseMaybeJson, type NearReport, type QuoteFields } from './attestation.js';
import type { CandidateEvidence, SignerId } from './evidence.js';
import { fromHex, toHex } from '../near/bytes.js';

export const NRAS_URL = 'https://nras.attestation.nvidia.com/v3/attest/gpu';
export const NRAS_JWKS_URL = 'https://nras.attestation.nvidia.com/.well-known/jwks.json';

/** Result of an Intel DCAP verification of one quote. */
export interface QuoteVerdict {
  status: string;
  advisoryIds: string[];
  fields: QuoteFields;
}

export interface RunDeps {
  /** verify a raw TDX quote (collateral + chain + TCB); throws when the quote is invalid */
  verifyQuote(quote: Uint8Array): Promise<QuoteVerdict>;
  fetchFn: typeof fetch;
  nowSecs: number;
  acceptedTcbStatuses: string[];
  gpuRequired: boolean;
}

type Check = { name: string; ok: boolean; detail?: string };

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

interface Jwk { kid?: string; kty: string; [k: string]: unknown }

/** Verify an ES384/ES256 JWT against a JWKS and return its claims; throws on any failure. */
export function verifyJwt(token: string, jwks: { keys: Jwk[] }, nowSecs: number): Record<string, unknown> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('malformed JWT');
  const header = JSON.parse(b64urlDecode(h).toString('utf8'));
  const hash = header.alg === 'ES384' ? 'sha384' : header.alg === 'ES256' ? 'sha256' : null;
  if (!hash) throw new Error(`unsupported JWT alg ${header.alg}`);
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`JWKS has no key ${header.kid}`);
  const ok = cryptoVerify(hash, Buffer.from(`${h}.${p}`), { key: createPublicKey({ key: jwk as any, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, b64urlDecode(s));
  if (!ok) throw new Error('JWT signature invalid');
  const claims = JSON.parse(b64urlDecode(p).toString('utf8'));
  if (typeof claims.exp === 'number' && claims.exp < nowSecs) throw new Error('JWT expired');
  return claims;
}

async function checkGpu(report: NearReport, nonce: string, d: RunDeps): Promise<Check[]> {
  if (!report.nvidia_payload) return [{ name: 'gpu_evidence_present', ok: !d.gpuRequired, detail: d.gpuRequired ? 'no nvidia_payload' : 'absent (not required)' }];
  const checks: Check[] = [{ name: 'gpu_evidence_present', ok: true }];
  const payload = parseMaybeJson<{ nonce?: string }>(report.nvidia_payload);
  const nonceOk = typeof payload.nonce === 'string' && payload.nonce.toLowerCase() === nonce.toLowerCase();
  checks.push({ name: 'gpu_nonce', ok: nonceOk, detail: nonceOk ? undefined : 'GPU payload nonce differs from ours' });
  if (!nonceOk) return checks;
  try {
    const res = await d.fetchFn(NRAS_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`NRAS HTTP ${res.status}`);
    const body: any = await res.json();
    if (body?.[0]?.[0] !== 'JWT') throw new Error('malformed NRAS response');
    const jwksRes = await d.fetchFn(NRAS_JWKS_URL);
    if (!jwksRes.ok) throw new Error(`JWKS HTTP ${jwksRes.status}`);
    const jwks = (await jwksRes.json()) as { keys: Jwk[] };
    const claims = verifyJwt(body[0][1], jwks, d.nowSecs);
    checks.push({ name: 'gpu_nras_jwt_signature', ok: true });
    const overall = claims['x-nvidia-overall-att-result'] === true;
    checks.push({ name: 'gpu_overall_attestation_result', ok: overall, detail: overall ? undefined : String(claims['x-nvidia-overall-att-result']) });
    // Individual GPU tokens (second element) are verified too, when NRAS returns them.
    const per = body[1] && typeof body[1] === 'object' ? (Object.values(body[1]) as string[]) : [];
    if (per.length) {
      per.forEach((t) => verifyJwt(t, jwks, d.nowSecs)); // signature + expiry of each per-GPU token
      checks.push({ name: 'gpu_per_device_token_signatures', ok: true, detail: `${per.length} devices` });
    }
  } catch (e) {
    checks.push({ name: 'gpu_nras_verdict', ok: false, detail: String(e instanceof Error ? e.message : e).slice(0, 200) });
  }
  return checks;
}

/** Verify one report (gateway or one model candidate). Never throws. */
export async function verifyCandidate(report: NearReport, nonce: string, d: RunDeps, withGpu: boolean): Promise<CandidateEvidence> {
  const checks: Check[] = [];
  let status = 'unknown';
  let advisoryIds: string[] = [];
  let measurements: Record<string, string> = {};
  try {
    const v = await d.verifyQuote(fromHex(report.intel_quote));
    status = v.status;
    advisoryIds = v.advisoryIds;
    checks.push({ name: 'intel_dcap_quote', ok: true });
    const tcbOk = d.acceptedTcbStatuses.includes(v.status);
    checks.push({ name: 'tcb_status_accepted', ok: tcbOk, detail: tcbOk ? v.status : `${v.status} not in ${d.acceptedTcbStatuses.join(',')}` });
    checks.push(...checkNearReport(report, nonce, v.fields).checks);
    const tcb = parseMaybeJson<Record<string, string>>(report.info.tcb_info);
    measurements = { mrTd: toHex(v.fields.mrTd), rtmr0: toHex(v.fields.rtMr0), rtmr1: toHex(v.fields.rtMr1), rtmr2: toHex(v.fields.rtMr2), rtmr3: toHex(v.fields.rtMr3), mrConfigId: toHex(v.fields.mrConfigId), composeHash: String(tcb.compose_hash ?? ''), osImageHash: String(tcb.os_image_hash ?? '') };
  } catch (e) {
    checks.push({ name: 'intel_dcap_quote', ok: false, detail: String(e instanceof Error ? e.message : e).slice(0, 200) });
  }
  if (withGpu) checks.push(...(await checkGpu(report, nonce, d)));
  const info = report.info as { instance_id?: string };
  return {
    signing_algo: report.signing_algo,
    signing_address: report.signing_address,
    instanceId: String(info.instance_id ?? ''),
    tcbStatus: status,
    advisoryIds,
    checks,
    verified: checks.every((c) => c.ok),
    measurements,
  };
}

export function uniqueSigners(cs: CandidateEvidence[]): SignerId[] {
  const seen = new Map<string, SignerId>();
  for (const c of cs) seen.set(`${c.signing_algo}:${c.signing_address.toLowerCase()}`, { signing_algo: c.signing_algo, signing_address: c.signing_address });
  return [...seen.values()];
}
