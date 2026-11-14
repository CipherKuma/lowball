// The attestation evidence file written by `npm run verify-attestation` (server/scripts/verify-attestation.ts).
// The Worker never verifies Intel quotes itself. It reads this record of a full DCAP + GPU verification run
// and only ever marks something verified when a signer in a live response matches a signer in this record.
import type { AttestationSummary } from '../../../shared/api.js';
import { sameSigner } from './attestation.js';

export interface SignerId {
  signing_algo: string;
  signing_address: string;
}

export interface CandidateEvidence extends SignerId {
  instanceId: string;
  /** Intel TCB status returned by the DCAP verifier */
  tcbStatus: string;
  advisoryIds: string[];
  /** every named check of attestation.ts#checkNearReport, plus gpu and policy checks */
  checks: { name: string; ok: boolean; detail?: string }[];
  verified: boolean;
  measurements: Record<string, string>;
}

export interface AttestationEvidence {
  schema: 1;
  model: string;
  /** `owned_by` and the doc tier from GET /v1/models at check time */
  catalogue: { ownedBy: string; tier: string; source: string };
  /** ISO time of the verification run */
  checkedAt: string;
  checker: string;
  evidenceUrl: string;
  policy: { acceptedTcbStatuses: string[]; gpuEvidenceRequired: boolean; signingAlgos: string[] };
  /** every required check passed for the gateway and for every model candidate */
  verified: boolean;
  gateway: { verified: boolean; signers: SignerId[]; candidate: CandidateEvidence | null };
  models: CandidateEvidence[];
  /** deduplicated signers of the verified model candidates */
  modelSigners: SignerId[];
  notChecked: string[];
}

export type SignatureKind = 'provider_tee' | 'gateway' | 'unknown';

/**
 * True when the response signer is bound by an Intel TDX quote that the evidence run verified in full:
 * a model signer for provider_tee, a gateway signer for gateway. Anything else is false.
 */
export function evidenceCovers(
  ev: AttestationEvidence | null,
  kind: SignatureKind,
  modelId: string,
  signer: SignerId,
): boolean {
  if (!ev || !ev.verified || ev.model !== modelId) return false;
  if (kind === 'provider_tee') return ev.modelSigners.some((s) => sameSigner(s, signer));
  if (kind === 'gateway') return ev.gateway.verified && ev.gateway.signers.some((s) => sameSigner(s, signer));
  return false;
}

/** Case File summary: evidence plus what the Worker saw in its own live preflight. */
export function summarizeEvidence(
  ev: AttestationEvidence | null,
  model: string,
  live: { modelSigners: SignerId[] } | null,
): AttestationSummary {
  const base = { checkedAt: ev?.checkedAt ?? null, evidenceUrl: ev?.evidenceUrl ?? null };
  const no = (reason: string): AttestationSummary => ({ verified: false, ...base, reason });
  if (!ev) return no('no attestation evidence recorded; run npm run verify-attestation');
  if (ev.model !== model) return no(`evidence is for ${ev.model}, not ${model}`);
  if (!ev.verified) return no('the last verification run did not pass');
  if (!live) return no('live attestation preflight unavailable, so the evidence could not be matched to this deployment');
  const match = live.modelSigners.some((s) => ev.modelSigners.some((e) => sameSigner(s, e)));
  if (!match) return no('the live model signer is not in the verified evidence (key rotated or evidence stale); re-run verification');
  return { verified: true, ...base };
}
