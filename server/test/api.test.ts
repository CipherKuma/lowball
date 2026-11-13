import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUYER_IDS } from '../../shared/api.js';
import { createApp } from '../src/app.js';
import { CONTRACT_ERRORS, SERVER_ERRORS, extractContractCode, toApiError, AppError } from '../src/errors.js';
import { parseOutcome } from '../src/near/signer.js';
import { runAdversarial } from '../sim/adversarial.js';
import { synthesize } from '../src/tts.js';
import { makeRig, PLAYER_PK } from './helpers.js';

function rigApp() {
  const rig = makeRig();
  const store: Record<string, Response> = {};
  const cache = {
    match: async (r: Request) => store[r.url]?.clone(),
    put: async (r: Request, res: Response) => void (store[r.url] = res.clone()),
  };
  let ttsCalls = 0;
  const app = createApp({
    deps: () => rig.deps,
    allowedOrigin: () => '*',
    maxSessionsPerIpHour: () => 2,
    elevenLabsKey: () => 'xi-test',
    cache: () => cache,
    ttsFetch: (async (url: string, init: any) => {
      ttsCalls++;
      expect(init.headers['xi-api-key']).toBe('xi-test');
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch,
  });
  const post = (path: string, body: unknown, ip = '9.9.9.9') =>
    app.request(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip } });
  return { app, rig, post, ttsCalls: () => ttsCalls };
}

describe('API boundaries (zod) and error shape', () => {
  it('POST /api/session rejects missing, malformed and extra fields with {error, code}', async () => {
    const { post } = rigApp();
    for (const bad of [{}, { playerPublicKey: 'nope' }, { playerPublicKey: 'ed25519:abc' }, { playerPublicKey: PLAYER_PK, extra: 1 }, 'not json']) {
      const r = await post('/api/session', bad);
      expect(r.status).toBe(400);
      const j = (await r.json()) as { error: string; code: string };
      expect(j.code).toBe('BAD_REQUEST');
      expect(typeof j.error).toBe('string');
      expect(JSON.stringify(j)).not.toMatch(/stack|at .*\.ts/);
    }
  });

  it('creates a session, serves events and enforces phases', async () => {
    const { post, app } = rigApp();
    const r = await post('/api/session', { playerPublicKey: PLAYER_PK });
    expect(r.status).toBe(200);
    const s = (await r.json()) as any;
    expect(s.buyers.map((b: any) => b.id)).toEqual([...BUYER_IDS]);
    expect(s.seasonId).toBeNull();
    expect(s.playerAccountId).toMatch(/\.house\.mock\.testnet$/);
    const ev = (await (await app.request(`/api/session/${s.sessionId}/events?after=0`)).json()) as any;
    expect(ev.events[0].type).toBe('account_created');
    expect(ev.status.phase).toBe('created');
    const sell = await post(`/api/session/${s.sessionId}/step`, { action: 'sell' });
    expect(sell.status).toBe(409);
    expect(((await sell.json()) as any).code).toBe('BAD_PHASE');
    const bad = await post(`/api/session/${s.sessionId}/step`, { action: 'explode' });
    expect(bad.status).toBe(400);
  });

  it('validates ids, after and txHash', async () => {
    const { app, post } = rigApp();
    expect((await app.request('/api/session/not-a-uuid/events')).status).toBe(400);
    const id = crypto.randomUUID();
    expect((await app.request(`/api/session/${id}/events?after=-1`)).status).toBe(400);
    expect((await app.request(`/api/session/${id}/events`)).status).toBe(404);
    expect((await post(`/api/session/${id}/leniency`, { txHash: 'short' })).status).toBe(400);
    expect((await app.request('/api/nope')).status).toBe(404);
  });

  it('rate-limits session creation per IP', async () => {
    const { post } = rigApp();
    expect((await post('/api/session', { playerPublicKey: PLAYER_PK }, '5.5.5.5')).status).toBe(200);
    expect((await post('/api/session', { playerPublicKey: PLAYER_PK }, '5.5.5.5')).status).toBe(200);
    const r = await post('/api/session', { playerPublicKey: PLAYER_PK }, '5.5.5.5');
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).code).toBe('RATE_LIMITED');
    expect((await post('/api/session', { playerPublicKey: PLAYER_PK }, '6.6.6.6')).status).toBe(200);
  });

  it('turns unknown exceptions into INTERNAL without leaking details', () => {
    const { body, status } = toApiError(new Error('SELECT * FROM secrets failed at /srv/x.ts:12'));
    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Internal error.', code: 'INTERNAL' });
  });
});

describe('error mapping for every contract error code', () => {
  const errorsRs = readFileSync(new URL('../../contract/src/errors.rs', import.meta.url), 'utf8');
  const codes = [...errorsRs.matchAll(/pub const (E_[A-Z_]+): &str/g)].map((m) => m[1]!);

  it('finds the contract codes', () => expect(codes.length).toBeGreaterThanOrEqual(30));

  it.each(codes)('%s maps to a safe message and survives a receipt failure round-trip', (code) => {
    expect(CONTRACT_ERRORS).toHaveProperty(code);
    const info = (CONTRACT_ERRORS as any)[code];
    expect(info.message.length).toBeGreaterThan(5);
    expect(info.message).not.toMatch(/panick|stack|E_/);
    const failure = { final_execution_outcome: { status: {}, receipts_outcome: [{ outcome: { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${code}` } } } } } } }] } };
    expect(parseOutcome('h', failure).errorCode).toBe(code);
    expect(extractContractCode(`xx ${code} yy`)).toBe(code);
    expect(new AppError(code as any).status).toBe(info.status);
  });

  it('no stale mapping for a code the contract does not define', () => {
    for (const k of Object.keys(CONTRACT_ERRORS)) expect(codes).toContain(k);
  });

  it('every server code has a mapping', () => {
    for (const k of ['BAD_REQUEST', 'NOT_FOUND', 'BAD_PHASE', 'BUSY', 'RATE_LIMITED', 'TREASURY_LOW', 'RPC_UNAVAILABLE', 'TX_FAILED', 'TX_NOT_FOUND', 'TX_MISMATCH', 'MODEL_UNAVAILABLE', 'MODEL_BAD_OUTPUT', 'TTS_UNAVAILABLE', 'INTERNAL']) {
      expect(SERVER_ERRORS).toHaveProperty(k);
    }
  });
});

describe('adversarial contract cases on the rule-faithful mock chain', () => {
  it('every refusal comes back with its stable code', async () => {
    const rig = makeRig();
    const results = await runAdversarial(rig.deps.chain, rig.deps.pactKeys, 'p1.house.mock.testnet', 200_000_000_000_000_000_000_000n);
    const failed = results.filter((r) => !r.pass);
    expect(failed).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(12);
  });
});

describe('TTS proxy', () => {
  it('serves a spoken line as audio and caches by voice+text', async () => {
    const { post, app, rig, ttsCalls } = rigApp();
    const s = (await (await post('/api/session', { playerPublicKey: PLAYER_PK })).json()) as any;
    // append a line event directly (the engine emits these during sell/hold)
    await rig.store.appendEvent(s.sessionId, { type: 'line', buyer: 'ines', text: 'Darling, sixty is generous.', mood: 'calm', seq: 2, ts: 1 });
    const a = await app.request(`/api/tts?session=${s.sessionId}&seq=2`);
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toBe('audio/mpeg');
    expect(a.headers.get('x-tts-cache')).toBe('miss');
    const b = await app.request(`/api/tts?session=${s.sessionId}&seq=2`);
    expect(b.headers.get('x-tts-cache')).toBe('hit');
    expect(ttsCalls()).toBe(1);
    const notLine = await app.request(`/api/tts?session=${s.sessionId}&seq=1`);
    expect(notLine.status).toBe(404);
    expect((await app.request('/api/tts?session=x&seq=1')).status).toBe(400);
  });

  it('maps an ElevenLabs failure to TTS_UNAVAILABLE', async () => {
    await expect(synthesize('marlow', 'x', { apiKey: 'k', fetchFn: (async () => new Response('no', { status: 500 })) as any })).rejects.toMatchObject({ code: 'TTS_UNAVAILABLE' });
    await expect(synthesize('marlow', 'x', { apiKey: 'k', voiceMap: {} })).rejects.toMatchObject({ code: 'TTS_UNAVAILABLE' });
  });
});
