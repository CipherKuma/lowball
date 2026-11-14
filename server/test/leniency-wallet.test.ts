// POST /api/session/:id/leniency without a txHash: wallet seasons only, confirmed from the chain.
import { describe, expect, it } from 'vitest';
import { createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { LeniencySchema } from '../src/schemas.js';
import { makeRig, PLAYER_PK, type Rig } from './helpers.js';

async function walletSeason(rig: Rig, accountId = 'alice.testnet') {
  const c = await createSession(rig.deps, '', '1.2.3.4', undefined, { accountId });
  await step(rig.deps, c.sessionId, 'begin');
  return c;
}
const types = async (rig: Rig, id: string) => (await getEvents(rig.deps, id, 0)).events.map((e) => e.type);

describe('leniency without a tx hash (wallet seasons)', () => {
  it('the schema accepts {} and a hash but still rejects anything else', () => {
    expect(LeniencySchema.safeParse({}).success).toBe(true);
    expect(LeniencySchema.safeParse({ txHash: '1'.repeat(44) }).success).toBe(true);
    expect(LeniencySchema.safeParse({ txHash: 'nope' }).success).toBe(false);
    expect(LeniencySchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('proceeds as with a verified hash once the player has opened the window on chain', async () => {
    const rig = makeRig({ confess: [] });
    const { sessionId, playerAccountId } = await walletSeason(rig);
    rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, null);
    expect(r.confessor).toBeNull();
    const t = await types(rig, sessionId);
    expect(t).toContain('leniency_open');
    expect(t.filter((x) => x === 'deliberating')).toHaveLength(5);
    // a second confirmation the same day is the same BAD_PHASE as with a hash
    await expect(leniency(rig.deps, sessionId, null)).rejects.toMatchObject({ code: 'BAD_PHASE' });
  });

  it('a confession race still settles from a hash-less offer', async () => {
    const rig = makeRig({ confess: ['sully', 'ines'] });
    const { sessionId, playerAccountId } = await walletSeason(rig);
    rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, null);
    expect(r.confessor).not.toBeNull();
    expect(r.status.confessed).toBe(true);
  });

  it('polls for a short while, then fails TX_FAILED (retryable) when the window never opened', async () => {
    const rig = makeRig();
    const { sessionId } = await walletSeason(rig);
    let calls = 0;
    const real = rig.chain.getSeason.bind(rig.chain);
    rig.chain.getSeason = (async (id: number) => (calls++, real(id))) as never;
    rig.deps.sleep = async () => undefined; // do not move the chain: nothing opened a window
    rig.deps.pollMs = 1000;
    await expect(leniency(rig.deps, sessionId, null)).rejects.toMatchObject({ code: 'TX_FAILED', retryable: true });
    expect(calls).toBeGreaterThan(5);
    expect(calls).toBeLessThanOrEqual(22); // about 20 s at 1 s
    expect(await types(rig, sessionId)).not.toContain('leniency_open');
  });

  it('a guest season still requires the tx hash', async () => {
    const rig = makeRig();
    const { sessionId, playerAccountId } = await (async () => {
      const c = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
      await step(rig.deps, c.sessionId, 'begin');
      return c;
    })();
    rig.chain.playerOffersLeniency(0, playerAccountId); // even with a live window
    await expect(leniency(rig.deps, sessionId, null)).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
    expect(await types(rig, sessionId)).not.toContain('leniency_open');
  });

  it('cannot be used to open a window for somebody else: only this season player counts', async () => {
    const rig = makeRig({ confess: [] });
    const a = await walletSeason(rig, 'alice.testnet');
    const b = await createSession(rig.deps, '', '1.2.3.5', undefined, { accountId: 'bob.testnet' });
    await step(rig.deps, b.sessionId, 'begin');
    // alice's window is open on chain; bob's season is a different season id with its own window state
    rig.chain.playerOffersLeniency(0, a.playerAccountId);
    rig.deps.sleep = async () => undefined;
    rig.deps.pollMs = 1000;
    await expect(leniency(rig.deps, b.sessionId, null)).rejects.toMatchObject({ code: 'TX_FAILED' });
  });
});
