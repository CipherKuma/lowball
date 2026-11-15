// GET /api/session/:id/summary and GET /api/me/seasons
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { tokenHash } from '../src/auth/service.js';
import { createSession, leniency, step } from '../src/game/engine.js';
import { makeRig, PLAYER_PK } from './helpers.js';

const BOND = 200_000_000_000_000_000_000_000n;

function setup(policy: Parameters<typeof makeRig>[0] = {}) {
  const rig = makeRig(policy);
  const app = createApp({
    deps: () => rig.deps,
    auth: () => ({ store: rig.store, rpc: null as never, recipient: 'r', now: () => 1_800_000_000_000 }),
    allowedOrigin: () => '*',
    maxSessionsPerIpHour: () => 99,
    elevenLabsKey: () => 'k',
    ttsMaxPerSession: () => 40,
  });
  const get = (path: string, token?: string) => app.request(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const signIn = async (accountId: string) => {
    const token = 't'.repeat(43);
    await rig.store.putAuthSession(tokenHash(token), accountId, 1_800_000_000_000 + 3_600_000);
    return token;
  };
  const wallet = async (accountId: string) => {
    const c = await createSession(rig.deps, '', '1.1.1.1', undefined, { accountId });
    await step(rig.deps, c.sessionId, 'begin');
    return c;
  };
  return { rig, get, signIn, wallet };
}

describe('GET /api/session/:id/summary', () => {
  it('a new season is open with payoutYocto null', async () => {
    const t = setup();
    const c = await t.wallet('alice.testnet');
    const r = await t.get(`/api/session/${c.sessionId}/summary`);
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j).toMatchObject({
      sessionId: c.sessionId, playerAccountId: 'alice.testnet', playerKind: 'wallet', phase: 'lot_open', closed: false, failed: false,
      confessor: null, payoutYocto: null, payoutEvm: null, days: 3,
    });
    expect(j.buyers).toHaveLength(5);
    expect(typeof j.createdAt).toBe('number');
    expect(j.seasonId).toBe(c.seasonId ?? j.seasonId);
  });

  it('after a confession payoutYocto is the slashed sum paid out', async () => {
    const t = setup({ confess: ['sully'] });
    const c = await t.wallet('alice.testnet');
    await step(t.rig.deps, c.sessionId, 'sell');
    const sid = (await t.rig.store.loadState(c.sessionId))!.seasonId!;
    const tx = t.rig.chain.playerOffersLeniency(sid, 'alice.testnet');
    const res = await leniency(t.rig.deps, c.sessionId, tx.hash);
    expect(res.confessor).toBe('sully');
    const j = (await (await t.get(`/api/session/${c.sessionId}/summary`)).json()) as any;
    expect(j).toMatchObject({ closed: true, phase: 'closed', confessor: 'sully' });
    expect(BigInt(j.payoutYocto)).toBe(4n * BOND);
  });

  it('a season that closes with nobody confessing pays 0', async () => {
    const t = setup();
    const c = await t.wallet('alice.testnet');
    for (let i = 0; i < 3; i++) {
      await step(t.rig.deps, c.sessionId, 'sell');
      await step(t.rig.deps, c.sessionId, 'next_day');
    }
    const j = (await (await t.get(`/api/session/${c.sessionId}/summary`)).json()) as any;
    expect(j).toMatchObject({ closed: true, confessor: null, payoutYocto: '0' });
  });

  it('unknown id is 404 NOT_FOUND', async () => {
    const t = setup();
    const r = await t.get(`/api/session/${crypto.randomUUID()}/summary`);
    expect(r.status).toBe(404);
    expect(((await r.json()) as any).code).toBe('NOT_FOUND');
  });
});

describe('GET /api/me/seasons', () => {
  it('is 401 AUTH_REQUIRED without a valid bearer', async () => {
    const t = setup();
    for (const tok of [undefined, 'nope']) {
      const r = await t.get('/api/me/seasons', tok);
      expect(r.status).toBe(401);
      expect(((await r.json()) as any).code).toBe('AUTH_REQUIRED');
    }
  });

  it('returns only this account\'s wallet seasons, newest first', async () => {
    const t = setup();
    const token = await t.signIn('alice.testnet');
    const a1 = await t.wallet('alice.testnet');
    await new Promise((r) => setTimeout(r, 5));
    await t.wallet('bob.testnet');
    await createSession(t.rig.deps, PLAYER_PK, '1.1.1.1'); // a guest season
    await new Promise((r) => setTimeout(r, 5));
    const a2 = await t.wallet('alice.testnet');
    // a guest-kind session that carries alice's account id must not be listed
    const g = await createSession(t.rig.deps, PLAYER_PK, '1.1.1.1');
    const gs = (await t.rig.store.loadState(g.sessionId))!;
    gs.playerAccountId = 'alice.testnet';
    await t.rig.store.saveState(g.sessionId, gs);
    const r = await t.get('/api/me/seasons', token);
    expect(r.status).toBe(200);
    const { seasons } = (await r.json()) as { seasons: any[] };
    expect(seasons.map((s) => s.sessionId)).toEqual([a2.sessionId, a1.sessionId]);
    expect(seasons.every((s) => s.playerKind === 'wallet' && s.playerAccountId === 'alice.testnet')).toBe(true);
  });

  it('caps the list at 20', async () => {
    const t = setup();
    const token = await t.signIn('alice.testnet');
    for (let i = 0; i < 22; i++) {
      const c = await createSession(t.rig.deps, '', '1.1.1.1', undefined, { accountId: 'alice.testnet' });
      t.rig.store.createdAt.set(c.sessionId, i);
    }
    const { seasons } = (await (await t.get('/api/me/seasons', token)).json()) as { seasons: any[] };
    expect(seasons).toHaveLength(20);
    expect(seasons[0].createdAt).toBe(21);
  });
});
