// Spend caps enforced by code: NEAR AI token spend (refuses POST /api/session) and ElevenLabs calls per session.
import { DEFAULT_MODEL } from '../src/llm/client.js';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createSession } from '../src/game/engine.js';
import { NearAiLlm } from '../src/llm/client.js';
import { BidOut, JSON_SCHEMAS } from '../src/llm/schemas.js';
import { costUsd, DEFAULT_NEARAI_BUDGET_USD, DEFAULT_TTS_MAX_PER_SESSION, FALLBACK_PRICE, priceOf } from '../src/pricing.js';
import { synthesize } from '../src/tts.js';
import { makeRig, PLAYER_PK } from './helpers.js';

describe('pricing', () => {
  it('prices GLM 5.3 Flash at $0.08 in / $0.50 out per million tokens (catalogue)', () => {
    expect(priceOf('z-ai/glm-5.3-flash')).toEqual({ in: 0.08, out: 0.5 });
    expect(costUsd('z-ai/glm-5.3-flash', 1_000_000, 1_000_000)).toBeCloseTo(0.58, 10);
    expect(costUsd('z-ai/glm-5.3-flash', 2000, 400)).toBeCloseTo(0.00036, 10);
  });
  it('an unknown model is priced at the high fallback so the cap errs on the safe side', () => {
    expect(priceOf('some/new-model')).toEqual(FALLBACK_PRICE);
    expect(costUsd('some/new-model', 1000, 1000)).toBeGreaterThan(costUsd('z-ai/glm-5.3-flash', 1000, 1000) * 10);
  });
  it('defaults: $8 of model spend, 80 voice calls per session', () => {
    expect(DEFAULT_NEARAI_BUDGET_USD).toBe(8);
    expect(DEFAULT_TTS_MAX_PER_SESSION).toBe(80);
  });
});

describe('usage ledger from the NEAR AI client', () => {
  const req = { buyer: 'odile' as const, kind: 'bid' as const, day: 2, system: 's', user: 'u', schema: BidOut, jsonSchema: JSON_SCHEMAS.bid, schemaName: 'bid' };
  const make = (reply: (n: number) => object | string, onUsage: (u: any) => void) => {
    let n = 0;
    const fetchFn = (async (url: string) => {
      if (url.includes('/attestation/report')) return new Response('{}');
      if (url.includes('/signature/')) return new Response('', { status: 404 });
      n++;
      const r = reply(n);
      return new Response(typeof r === 'string' ? r : JSON.stringify(r));
    }) as unknown as typeof fetch;
    return new NearAiLlm({ apiKey: 'k', fetchFn, sleep: async () => undefined, onUsage });
  };
  const ok = (content: string, usage?: object) => ({ id: 'c1', choices: [{ message: { content } }], ...(usage ? { usage } : {}) });

  it('reports prompt and completion tokens from the usage block, also for a reply that is then rejected', async () => {
    const seen: any[] = [];
    const llm = make((n) => (n === 1 ? ok('not json', { prompt_tokens: 900, completion_tokens: 40 }) : ok('{"amount":60,"say":"x","mood":"calm"}', { prompt_tokens: 910, completion_tokens: 30 })), (u) => void seen.push(u));
    await llm.complete(req);
    expect(seen).toEqual([
      { model: DEFAULT_MODEL, promptTokens: 900, completionTokens: 40, estimated: false },
      { model: DEFAULT_MODEL, promptTokens: 910, completionTokens: 30, estimated: false },
    ]);
  });

  it('with no usage block it records an upper-bound estimate from byte sizes, flagged as estimated', async () => {
    const seen: any[] = [];
    const llm = make(() => ok('{"amount":60,"say":"x","mood":"calm"}'), (u) => void seen.push(u));
    await llm.complete(req);
    expect(seen).toHaveLength(1);
    expect(seen[0].estimated).toBe(true);
    expect(seen[0].promptTokens).toBeGreaterThan(50);
    expect(seen[0].completionTokens).toBeGreaterThan(30);
  });

  it('a failing ledger never breaks a completion', async () => {
    const llm = make(() => ok('{"amount":60,"say":"x","mood":"calm"}', { prompt_tokens: 1, completion_tokens: 1 }), () => {
      throw new Error('d1 down');
    });
    await expect(llm.complete(req)).resolves.toMatchObject({ value: { amount: 60 } });
  });
});

describe('NEAR AI budget refuses new sessions', () => {
  it('allows a session below the cap and refuses with BUDGET_EXHAUSTED once cumulative spend reaches it', async () => {
    const rig = makeRig({}, { nearAiBudgetUsd: 8 });
    await rig.store.addSpend({ model: DEFAULT_MODEL, promptTokens: 1, completionTokens: 1, usd: 7.99 });
    await expect(createSession(rig.deps, PLAYER_PK, 'ip')).resolves.toMatchObject({ network: 'testnet' });
    await rig.store.addSpend({ model: DEFAULT_MODEL, promptTokens: 1, completionTokens: 1, usd: 0.01 });
    expect(await rig.store.totalSpendUsd()).toBeCloseTo(8, 10);
    await expect(createSession(rig.deps, PLAYER_PK, 'ip')).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' });
  });

  it('is checked before any chain work: a refused session creates no account', async () => {
    const rig = makeRig({}, { nearAiBudgetUsd: 1 });
    await rig.store.addSpend({ model: 'm', promptTokens: 0, completionTokens: 0, usd: 1 });
    await expect(createSession(rig.deps, PLAYER_PK, 'ip')).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' });
    expect(rig.chain.log).toHaveLength(0);
  });

  it('POST /api/session answers 402 {error, code: BUDGET_EXHAUSTED}', async () => {
    const rig = makeRig({}, { nearAiBudgetUsd: 0.5 });
    await rig.store.addSpend({ model: 'm', promptTokens: 0, completionTokens: 0, usd: 0.6 });
    const app = createApp({ deps: () => rig.deps, allowedOrigin: () => '*', maxSessionsPerIpHour: () => 99, elevenLabsKey: () => 'k', ttsMaxPerSession: () => 40 });
    const r = await app.request('/api/session', { method: 'POST', body: JSON.stringify({ playerPublicKey: PLAYER_PK }), headers: { 'content-type': 'application/json' } });
    expect(r.status).toBe(402);
    const j = (await r.json()) as { error: string; code: string };
    expect(j.code).toBe('BUDGET_EXHAUSTED');
    expect(typeof j.error).toBe('string');
  });
});

describe('ElevenLabs cap per session', () => {
  const upstream = () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchFn, calls: () => calls };
  };
  const cacheOf = () => {
    const m = new Map<string, Response>();
    return { match: async (r: Request) => m.get(r.url)?.clone(), put: async (r: Request, res: Response) => void m.set(r.url, res.clone()) };
  };

  it('stops calling ElevenLabs after the cap, serves cache hits for free, and answers TTS_LIMIT', async () => {
    const rig = makeRig();
    const u = upstream();
    const cache = cacheOf();
    const go = (text: string) =>
      synthesize('ines', text, { apiKey: 'k', fetchFn: u.fetchFn, cache, reserve: () => rig.store.reserveTts('s1', 2), release: () => rig.store.releaseTts('s1') });
    await go('one');
    await go('two');
    expect(u.calls()).toBe(2);
    const hit = await go('one'); // cached: no upstream call, no cap used
    expect(hit.headers.get('x-tts-cache')).toBe('hit');
    await expect(go('three')).rejects.toMatchObject({ code: 'TTS_LIMIT' });
    expect(u.calls()).toBe(2);
  });

  it('the cap is per session, and a failed upstream call gives its slot back', async () => {
    const rig = makeRig();
    const bad = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    const opts = (s: string, f: typeof fetch) => ({ apiKey: 'k', fetchFn: f, reserve: () => rig.store.reserveTts(s, 1), release: () => rig.store.releaseTts(s) });
    await expect(synthesize('odile', 'x', opts('a', bad))).rejects.toMatchObject({ code: 'TTS_UNAVAILABLE' });
    await expect(synthesize('odile', 'x', opts('a', upstream().fetchFn))).resolves.toBeInstanceOf(Response); // slot returned
    await expect(synthesize('odile', 'y', opts('a', upstream().fetchFn))).rejects.toMatchObject({ code: 'TTS_LIMIT' });
    await expect(synthesize('odile', 'y', opts('b', upstream().fetchFn))).resolves.toBeInstanceOf(Response); // other session
  });

  it('GET /api/tts maps the cap to 429 {error, code: TTS_LIMIT}', async () => {
    const rig = makeRig();
    const { sessionId } = await createSession(rig.deps, PLAYER_PK, 'ip');
    for (const seq of [2, 3, 4]) await rig.store.appendEvent(sessionId, { type: 'line', buyer: 'marlow', text: `line ${seq}`, mood: 'calm', seq, ts: 1 });
    const u = upstream();
    const app = createApp({ deps: () => rig.deps, allowedOrigin: () => '*', maxSessionsPerIpHour: () => 99, elevenLabsKey: () => 'k', ttsMaxPerSession: () => 2, ttsFetch: u.fetchFn });
    expect((await app.request(`/api/tts?session=${sessionId}&seq=2`)).status).toBe(200);
    expect((await app.request(`/api/tts?session=${sessionId}&seq=3`)).status).toBe(200);
    const r = await app.request(`/api/tts?session=${sessionId}&seq=4`);
    expect(r.status).toBe(429);
    expect(((await r.json()) as { code: string }).code).toBe('TTS_LIMIT');
    expect(u.calls()).toBe(2);
  });
});
