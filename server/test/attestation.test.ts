// Attestation verification against a REAL recorded NEAR AI report (test/fixtures/attestation-recorded.json,
// recorded from the live public endpoint with scripts/verify-attestation.ts --record-fixture).
// Intel collateral and the NVIDIA verdict are replayed from the recording, so these run offline and deterministically.
import { readFileSync } from 'node:fs';
import { verify, type Collateral } from '@phala/dcap-qvl';
import { describe, expect, it } from 'vitest';
import { checkNearReport, parseMaybeJson, parseTdxQuote, replayRtmr3, type NearReport } from '../src/llm/attestation.js';
import { NRAS_JWKS_URL, NRAS_URL, verifyCandidate, type RunDeps } from '../src/llm/evidence-run.js';
import { fromHex, toHex } from '../src/near/bytes.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/attestation-recorded.json', import.meta.url), 'utf8'));
const gateway: NearReport = fx.gateway_attestation;
const model: NearReport = fx.model_attestations[0];

function fetchFn(over: { nrasStatus?: number; post?: string } = {}): typeof fetch {
  return (async (url: string) => {
    if (url === NRAS_URL) return new Response(over.post ?? fx.nras.postResponse, { status: over.nrasStatus ?? 200 });
    if (url === NRAS_JWKS_URL) return new Response(fx.nras.jwks, { status: 200 });
    throw new Error('unexpected fetch ' + url);
  }) as unknown as typeof fetch;
}

function deps(over: Partial<RunDeps> = {}, f: typeof fetch = fetchFn()): RunDeps {
  return {
    nowSecs: fx.nowSecs,
    acceptedTcbStatuses: ['UpToDate'],
    gpuRequired: true,
    fetchFn: f,
    async verifyQuote(quote) {
      const col = fx.collateral[toHex(quote).slice(0, 64)] as Collateral;
      const v = verify(quote, col, fx.nowSecs);
      const d = (v.report as any).data;
      return { status: v.status, advisoryIds: v.advisory_ids, fields: d };
    },
    ...over,
  };
}
const failed = (c: { checks: { name: string; ok: boolean }[] }) => c.checks.filter((x) => !x.ok).map((x) => x.name);

describe('recorded real NEAR AI report: full verification', () => {
  it('passes for the gateway and for the model candidate with GPU evidence', async () => {
    const g = await verifyCandidate(gateway, fx.nonce, deps(), false);
    expect(failed(g)).toEqual([]);
    expect(g.verified).toBe(true);
    expect(g.tcbStatus).toBe('UpToDate');
    const m = await verifyCandidate(model, fx.nonce, deps(), true);
    expect(failed(m)).toEqual([]);
    expect(m.verified).toBe(true);
    expect(m.checks.map((c) => c.name)).toEqual(
      expect.arrayContaining(['intel_dcap_quote', 'report_data_binds_signer_and_nonce', 'rtmr3_matches_event_log', 'gpu_nras_jwt_signature', 'gpu_overall_attestation_result']),
    );
    expect(m.signing_address).toBe(model.signing_address);
  });

  it('our quote parser agrees with the DCAP-verified fields', () => {
    const q = fromHex(model.intel_quote);
    const own = parseTdxQuote(q);
    const col = fx.collateral[toHex(q).slice(0, 64)] as Collateral;
    const theirs = (verify(q, col, fx.nowSecs).report as any).data;
    expect(toHex(own.reportData)).toBe(toHex(theirs.reportData));
    expect(toHex(own.rtMr3)).toBe(toHex(theirs.rtMr3));
    expect(toHex(own.mrConfigId)).toBe(toHex(theirs.mrConfigId));
    expect(toHex(own.mrTd)).toBe(toHex(theirs.mrTd));
  });

  it('rejects a replayed report under a different nonce', async () => {
    const other = 'ab'.repeat(32);
    const m = await verifyCandidate(model, other, deps(), true);
    expect(m.verified).toBe(false);
    expect(failed(m)).toEqual(expect.arrayContaining(['nonce_echo', 'report_data_binds_signer_and_nonce']));
  });

  it('rejects a swapped signing address (report data binds the signer)', async () => {
    const forged = { ...model, signing_address: '0x' + '11'.repeat(20) };
    const m = await verifyCandidate(forged, fx.nonce, deps(), false);
    expect(m.verified).toBe(false);
    expect(failed(m)).toContain('report_data_binds_signer_and_nonce');
  });

  it('rejects a quote with a flipped byte (Intel signature chain breaks)', async () => {
    const q = fromHex(model.intel_quote);
    q[100] = q[100]! ^ 0x01; // inside the signed TD report body
    const m = await verifyCandidate({ ...model, intel_quote: toHex(q) }, fx.nonce, deps({
      async verifyQuote(quote) {
        const col = fx.collateral[toHex(fromHex(model.intel_quote)).slice(0, 64)] as Collateral;
        const v = verify(quote, col, fx.nowSecs);
        return { status: v.status, advisoryIds: v.advisory_ids, fields: (v.report as any).data };
      },
    }), false);
    expect(m.verified).toBe(false);
    expect(failed(m)).toContain('intel_dcap_quote');
  });

  it('rejects an edited app_compose (MRCONFIGID mismatch) and an edited event log (RTMR3 mismatch)', async () => {
    const tcb: any = parseMaybeJson(model.info.tcb_info);
    const badCompose = { ...model, info: { ...model.info, tcb_info: { ...tcb, app_compose: tcb.app_compose + ' ' } } };
    expect(failed(await verifyCandidate(badCompose, fx.nonce, deps(), false))).toContain('mrconfigid_matches_app_compose');
    const log: any[] = structuredClone(parseMaybeJson<any[]>(model.event_log));
    const i = log.findIndex((e: any) => e.imr === 3);
    log[i].event_payload = log[i].event_payload.slice(0, -2) + (log[i].event_payload.endsWith('00') ? '01' : '00');
    const badLog = { ...model, event_log: log };
    expect(failed(await verifyCandidate(badLog, fx.nonce, deps(), false))).toContain('rtmr3_matches_event_log');
  });

  it('enforces the TCB status policy', async () => {
    const m = await verifyCandidate(model, fx.nonce, deps({ acceptedTcbStatuses: ['SWHardeningNeeded'] }), false);
    expect(m.verified).toBe(false);
    expect(failed(m)).toContain('tcb_status_accepted');
  });

  it('refuses TDX debug mode', () => {
    const q = parseTdxQuote(fromHex(model.intel_quote));
    q.tdAttributes = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(failed(checkNearReport(model, fx.nonce, q))).toEqual(['td_debug_off']);
  });

  it('replayRtmr3 reproduces the quote RTMR3', () => {
    expect(toHex(replayRtmr3(model.event_log))).toBe(toHex(parseTdxQuote(fromHex(model.intel_quote)).rtMr3));
  });
});

describe('GPU evidence (NVIDIA NRAS)', () => {
  it('fails when GPU evidence is required but absent', async () => {
    const { nvidia_payload: _drop, ...noGpu } = model;
    const m = await verifyCandidate(noGpu as NearReport, fx.nonce, deps(), true);
    expect(m.verified).toBe(false);
    expect(failed(m)).toContain('gpu_evidence_present');
  });

  it('fails on a GPU payload carrying another nonce', async () => {
    const m = await verifyCandidate({ ...model, nvidia_payload: JSON.stringify({ nonce: 'cd'.repeat(32) }) }, fx.nonce, deps(), true);
    expect(failed(m)).toContain('gpu_nonce');
  });

  it('fails when NRAS rejects the evidence', async () => {
    const m = await verifyCandidate(model, fx.nonce, deps({}, fetchFn({ nrasStatus: 500, post: 'no' })), true);
    expect(m.verified).toBe(false);
    expect(failed(m)).toContain('gpu_nras_verdict');
  });

  it('fails when the verdict token was altered (JWT signature is checked against the NVIDIA JWKS, not just decoded)', async () => {
    const body = JSON.parse(fx.nras.postResponse);
    const [h, p, s] = body[0][1].split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    claims['x-nvidia-overall-att-result'] = true;
    claims.iat = (claims.iat ?? 0) + 1; // any edit must break the signature
    body[0][1] = `${h}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${s}`;
    const m = await verifyCandidate(model, fx.nonce, deps({}, fetchFn({ post: JSON.stringify(body) })), true);
    expect(m.verified).toBe(false);
    expect(m.checks.find((c) => c.name === 'gpu_nras_verdict')?.detail).toMatch(/signature invalid/);
  });

  it('fails when the verdict token is expired at check time', async () => {
    const m = await verifyCandidate(model, fx.nonce, deps({ nowSecs: fx.nowSecs + 10 * 365 * 86400 }), true);
    expect(m.verified).toBe(false);
  });
});
