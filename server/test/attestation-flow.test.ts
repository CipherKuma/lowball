// How attestation evidence reaches receipts and the Case File (synthetic signers + recorded real report for the preflight).
import { readFileSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';
import { NearAiLlm, DEFAULT_MODEL } from '../src/llm/client.js';
import { evidenceCovers, summarizeEvidence, type AttestationEvidence } from '../src/llm/evidence.js';
import { sha256Hex, verifyReceipt } from '../src/llm/verify.js';
import { casefile, createSession, step } from '../src/game/engine.js';
import { toHex, utf8 } from '../src/near/bytes.js';
import { makeRig, PLAYER_PK } from './helpers.js';
import bundled from '../src/llm/attestation-evidence.json';

const fx = JSON.parse(readFileSync(new URL('./fixtures/attestation-recorded.json', import.meta.url), 'utf8'));
const MODEL = 'z-ai/glm-5.3-flash';

// ---- a synthetic ed25519 "model TEE" signer ----
const seed = ed25519.utils.randomPrivateKey();
const signer = { signing_algo: 'ed25519', signing_address: toHex(ed25519.getPublicKey(seed)) };
const req = utf8(JSON.stringify({ model: MODEL, messages: [] }));
const resp = utf8('{"id":"chatcmpl-1","choices":[]}');
const text = `${MODEL}:${sha256Hex(req)}:${sha256Hex(resp)}`;
const payload = { text, signature: toHex(ed25519.sign(utf8(text), seed)), ...signer, signature_kind: 'provider_tee' };

const evidence = (over: Partial<AttestationEvidence> = {}): AttestationEvidence => ({
  ...(bundled as unknown as AttestationEvidence),
  model: MODEL,
  verified: true,
  checkedAt: '2026-11-14T05:00:00.000Z',
  evidenceUrl: 'server/evidence/x.json',
  gateway: { verified: true, signers: [], candidate: null },
  modelSigners: [signer],
  ...over,
});
const run = (extra: Record<string, unknown>) => verifyReceipt({ requestBytes: req, responseBytes: resp, modelId: MODEL, payload, preflight: null, ...extra });

describe('provider_tee receipts', () => {
  it('without a model attestation preflight a provider_tee signature is NOT verified (no free pass)', () => {
    const v = run({});
    expect(v).toMatchObject({ textMatches: true, signatureValid: true, signerMatchesPreflight: false, verified: false, quoteVerified: false });
  });

  it('verifies when the signer is among the preflight model signers, but quoteVerified needs evidence', () => {
    const v = run({ modelSigners: [signer] });
    expect(v).toMatchObject({ signerMatchesPreflight: true, verified: true, quoteVerified: false });
  });

  it('quoteVerified is true only when the evidence run covers this model and this signer', () => {
    expect(run({ modelSigners: [signer], evidence: evidence() }).quoteVerified).toBe(true);
    expect(run({ modelSigners: [signer], evidence: evidence({ modelSigners: [{ ...signer, signing_address: '00'.repeat(32) }] }) }).quoteVerified).toBe(false);
    expect(run({ modelSigners: [signer], evidence: evidence({ model: 'anthropic/claude-haiku-5-5' }) }).quoteVerified).toBe(false);
    expect(run({ modelSigners: [signer], evidence: evidence({ verified: false }) }).quoteVerified).toBe(false);
    expect(run({ modelSigners: [signer], evidence: null }).quoteVerified).toBe(false);
  });

  it('never marks a response quoteVerified when the signature itself failed', () => {
    const bad = { ...payload, signature: payload.signature.replace(/^../, '00') };
    const v = run({ payload: bad, modelSigners: [signer], evidence: evidence() });
    expect(v).toMatchObject({ signatureValid: false, verified: false, quoteVerified: false });
  });

  it('a gateway signature is covered only by the gateway evidence, never by the model signers', () => {
    const t = `${sha256Hex(req)}:${sha256Hex(resp)}`;
    const gw = { text: t, signature: toHex(ed25519.sign(utf8(t), seed)), ...signer, signature_kind: 'gateway' };
    const ev = evidence();
    expect(evidenceCovers(ev, 'gateway', MODEL, signer)).toBe(false);
    const v = run({ payload: gw, preflight: { signing_address: signer.signing_address, signing_algo: 'ed25519' }, modelSigners: [signer], evidence: ev });
    expect(v).toMatchObject({ verified: true, quoteVerified: false });
  });
});

describe('summarizeEvidence', () => {
  const live = { modelSigners: [signer] };
  it('verified only when evidence passed and the live signer is in it', () => {
    expect(summarizeEvidence(evidence(), MODEL, live)).toEqual({ verified: true, checkedAt: '2026-11-14T05:00:00.000Z', evidenceUrl: 'server/evidence/x.json' });
  });
  it.each([
    ['no evidence', null, MODEL, live, /no attestation evidence/],
    ['other model', evidence(), 'other/model', live, /not other\/model/],
    ['failed run', evidence({ verified: false }), MODEL, live, /did not pass/],
    ['no live preflight', evidence(), MODEL, null, /preflight unavailable/],
    ['rotated signer', evidence(), MODEL, { modelSigners: [{ ...signer, signing_address: '11'.repeat(32) }] }, /rotated|stale/],
  ])('is not verified: %s', (_n, ev, model, lv, reason) => {
    const s = summarizeEvidence(ev as AttestationEvidence | null, model as string, lv as typeof live | null);
    expect(s.verified).toBe(false);
    expect(s.reason).toMatch(reason as RegExp);
  });
});

describe('bundled evidence', () => {
  it('is for the configured default model and, if verified, carries signers from a passed run', () => {
    const ev = bundled as unknown as AttestationEvidence;
    expect(ev.model).toBe(DEFAULT_MODEL);
    if (ev.verified) {
      expect(ev.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(ev.modelSigners.length).toBeGreaterThan(0);
      expect(ev.models.every((m) => m.verified && m.checks.every((c) => c.ok))).toBe(true);
      expect(ev.catalogue.ownedBy).toBe('nearai');
    } else {
      expect(ev.modelSigners).toEqual([]);
    }
  });
});

// ---- Worker preflight against the recorded real report (offline binding checks) ----
function reportFetch(tamper?: (body: any) => void): typeof fetch {
  return (async (url: string) => {
    if (!url.includes('/attestation/report')) return new Response('', { status: 404 });
    const body = structuredClone({ gateway_attestation: fx.gateway_attestation, model_attestations: fx.model_attestations });
    tamper?.(body);
    return new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;
}
const llm = (f: typeof fetch, over: Record<string, unknown> = {}) =>
  new NearAiLlm({ apiKey: 'k', fetchFn: f, nonceFn: () => fx.nonce, sleep: async () => undefined, ...over });

describe('NearAiLlm preflight and attestation()', () => {
  it('requests the model report for the configured model with provider=near and a 32-byte nonce', async () => {
    const urls: string[] = [];
    const f = (async (u: string) => (urls.push(u), reportFetch()(u))) as unknown as typeof fetch;
    await llm(f).getPreflight();
    const q = new URL(urls[0]!).searchParams;
    expect(q.get('model')).toBe(DEFAULT_MODEL);
    expect(q.get('provider')).toBe('near');
    expect(q.get('nonce')).toBe(fx.nonce);
    expect(q.get('signing_algo')).toBe('ecdsa');
  });

  it('accepts the recorded model signer (nonce, signer, MRCONFIGID and RTMR3 all check out offline)', async () => {
    const pf = await llm(reportFetch()).getPreflight();
    expect(pf.models).toEqual([{ signing_address: fx.model_attestations[0].signing_address, signing_algo: 'ecdsa' }]);
    expect(pf.gateway?.signing_address).toBe(fx.gateway_attestation.signing_address);
  });

  it('accepts no model signer when the report was made for another nonce (replay)', async () => {
    const pf = await new NearAiLlm({ apiKey: 'k', fetchFn: reportFetch(), nonceFn: () => 'ee'.repeat(32), sleep: async () => undefined }).getPreflight();
    expect(pf.models).toEqual([]);
  });

  it('fails closed: one bad candidate removes every model signer', async () => {
    const pf = await llm(reportFetch((b) => {
      b.model_attestations.push({ ...b.model_attestations[0], signing_address: '0x' + '22'.repeat(20) });
    })).getPreflight();
    expect(pf.candidates).toBe(2);
    expect(pf.models).toEqual([]);
  });

  it('attestation() is verified when the bundled-style evidence holds the live signer; not when it does not', async () => {
    const signerEv = { signing_algo: 'ecdsa', signing_address: fx.model_attestations[0].signing_address };
    const ok = await llm(reportFetch(), { model: DEFAULT_MODEL, evidence: evidence({ model: DEFAULT_MODEL, modelSigners: [signerEv] }) }).attestation();
    expect(ok.verified).toBe(true);
    const stale = await llm(reportFetch(), { evidence: evidence({ model: DEFAULT_MODEL, modelSigners: [{ ...signerEv, signing_address: '0x' + '33'.repeat(20) }] }) }).attestation();
    expect(stale.verified).toBe(false);
    const none = await llm(reportFetch(), { evidence: null }).attestation();
    expect(none).toMatchObject({ verified: false, checkedAt: null, evidenceUrl: null });
    const down = await llm((async () => new Response('', { status: 503 })) as unknown as typeof fetch, { evidence: evidence({ model: DEFAULT_MODEL }) }).attestation();
    expect(down.verified).toBe(false);
  });
});

describe('Case File', () => {
  it('carries the attestation summary when the model client provides one', async () => {
    const rig = makeRig();
    const summary = { verified: false, checkedAt: null, evidenceUrl: null, reason: 'scripted' };
    (rig.llm as unknown as { attestation: () => Promise<typeof summary> }).attestation = async () => summary;
    const { sessionId } = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
    await step(rig.deps, sessionId, 'begin');
    for (let d = 1; d <= 3; d++) {
      await step(rig.deps, sessionId, 'sell');
      await step(rig.deps, sessionId, 'next_day');
    }
    expect((await casefile(rig.deps, sessionId)).attestation).toEqual(summary);
  });
});
