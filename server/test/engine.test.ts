import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../shared/api.js';
import { AppError } from '../src/errors.js';
import { casefile, createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { makeRig, PLAYER_PK, type Rig } from './helpers.js';

async function start(rig: Rig) {
  const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
  await step(rig.deps, created.sessionId, 'begin');
  return created;
}
const types = (evs: GameEvent[]) => evs.map((e) => e.type);
const all = async (rig: Rig, id: string) => (await getEvents(rig.deps, id, 0)).events;

describe('event ordering', () => {
  it('begin emits account, season, 5 bonds, cartel, rumour, then day 1 in order', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    const t = types(await all(rig, sessionId));
    expect(t.slice(0, 2)).toEqual(['account_created', 'season_created']);
    expect(t.filter((x) => x === 'bond_posted')).toHaveLength(5);
    const iBond = t.lastIndexOf('bond_posted');
    expect(t.indexOf('cartel_forming')).toBeGreaterThan(iBond);
    expect(t.indexOf('rumour')).toBeGreaterThan(t.indexOf('cartel_forming'));
    expect(t.indexOf('day_opened')).toBeGreaterThan(t.indexOf('rumour'));
    expect(t).not.toContain('pact_signed'); // the pact must never be announced publicly
  });

  it('seq is strictly increasing from 1 with no gaps', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    await step(rig.deps, sessionId, 'sell');
    const evs = await all(rig, sessionId);
    evs.forEach((e, i) => expect(e.seq).toBe(i + 1));
  });

  it('a sold day runs commit, reveal, lines, settle in order and polling resumes with after=n', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    const before = (await getEvents(rig.deps, sessionId, 0)).status.lastSeq;
    await step(rig.deps, sessionId, 'sell');
    const { events, status } = await getEvents(rig.deps, sessionId, before);
    const t = types(events);
    expect(t.filter((x) => x === 'bid_committed')).toHaveLength(5);
    expect(t.indexOf('bids_revealed')).toBeGreaterThan(t.lastIndexOf('bid_committed'));
    expect(t.indexOf('lot_settled')).toBeGreaterThan(t.indexOf('bids_revealed'));
    expect(t.filter((x) => x === 'line')).toHaveLength(5);
    const rev = events.find((e) => e.type === 'bids_revealed')!;
    expect(rev.type === 'bids_revealed' && rev.identical).toBe(true);
    const settled = events.find((e) => e.type === 'lot_settled')!;
    expect(settled.type === 'lot_settled' && settled.price).toBe(60);
    expect(status.phase).toBe('settled');
  });
});

describe('season flow', () => {
  it('plays all days then closes the season', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    for (let d = 1; d <= 3; d++) {
      await step(rig.deps, sessionId, 'sell');
      await step(rig.deps, sessionId, 'next_day');
    }
    const { status } = await getEvents(rig.deps, sessionId, 0);
    expect(status.phase).toBe('closed');
    expect(types(await all(rig, sessionId)).at(-1)).toBe('season_closed');
    const cf = await casefile(rig.deps, sessionId);
    expect(cf.pact?.members).toHaveLength(5);
    expect(cf.channel).toHaveLength(10);
    expect(cf.receipts.length).toBeGreaterThan(10);
    expect(cf.txs.length).toBeGreaterThan(20);
  });

  it('seals the case file until the season closes', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    await expect(casefile(rig.deps, sessionId)).rejects.toMatchObject({ code: 'BAD_PHASE' });
  });

  it('rejects actions in the wrong phase', async () => {
    const rig = makeRig();
    const created = await createSession(rig.deps, PLAYER_PK, 'ip');
    await expect(step(rig.deps, created.sessionId, 'sell')).rejects.toMatchObject({ code: 'BAD_PHASE' });
    await step(rig.deps, created.sessionId, 'begin');
    await expect(step(rig.deps, created.sessionId, 'begin')).rejects.toMatchObject({ code: 'BAD_PHASE' });
    await expect(step(rig.deps, created.sessionId, 'next_day')).rejects.toMatchObject({ code: 'BAD_PHASE' });
  });

  it('hold keeps the lot open and buyers react aloud', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    const before = (await all(rig, sessionId)).length;
    await step(rig.deps, sessionId, 'hold');
    const evs = (await all(rig, sessionId)).slice(before);
    expect(types(evs).filter((t) => t === 'line')).toHaveLength(5);
    expect((await getEvents(rig.deps, sessionId, 0)).status.phase).toBe('lot_open');
  });

  it('a commit that fails mid-auction resumes without re-asking the models or double-committing', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    const real = rig.chain.commitBid.bind(rig.chain);
    let failed = false;
    rig.chain.commitBid = async (b, id, h) => {
      if (b === 'ines' && !failed) {
        failed = true;
        return { hash: 'x', ok: false, errorCode: 'TX_FAILED' as const };
      }
      return real(b, id, h);
    };
    await expect(step(rig.deps, sessionId, 'sell')).rejects.toBeInstanceOf(AppError);
    expect((await getEvents(rig.deps, sessionId, 0)).status.phase).toBe('lot_open');
    await step(rig.deps, sessionId, 'sell');
    const t = types(await all(rig, sessionId));
    expect(t.filter((x) => x === 'bid_committed')).toHaveLength(5);
    expect(t).toContain('lot_settled');
    expect(rig.llm.calls.filter((c) => c.kind === 'bid')).toHaveLength(5); // not asked again
    expect(rig.chain.log.filter((l) => l.label === 'commit_bid' && l.ok)).toHaveLength(5);
  });

  it('caps holds per day so the lot cannot be stalled forever', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    await step(rig.deps, sessionId, 'hold');
    await step(rig.deps, sessionId, 'hold');
    await expect(step(rig.deps, sessionId, 'hold')).rejects.toMatchObject({ code: 'BAD_PHASE' });
    await expect(step(rig.deps, sessionId, 'sell')).resolves.toMatchObject({ ok: true });
  });

  it('returns BUSY while a step holds the session lock', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    await rig.store.tryLock(sessionId, 60_000);
    await expect(step(rig.deps, sessionId, 'sell')).rejects.toMatchObject({ code: 'BUSY' });
    expect((await getEvents(rig.deps, sessionId, 0)).status.busy).toBe(true);
  });

  it('unknown session is NOT_FOUND', async () => {
    const rig = makeRig();
    await expect(step(rig.deps, crypto.randomUUID(), 'begin')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('treasury and model failures', () => {
  it('TREASURY_LOW when the house cannot fund a season', async () => {
    const rig = makeRig();
    rig.chain.treasury = 0n;
    await expect(createSession(rig.deps, PLAYER_PK, 'ip')).rejects.toMatchObject({ code: 'TREASURY_LOW' });
  });

  it('a model failure emits error{retryable} and never fakes a decision; the step can be retried', async () => {
    const rig = makeRig({ failFor: ['sully'] });
    const { sessionId } = await createSession(rig.deps, PLAYER_PK, 'ip');
    await expect(step(rig.deps, sessionId, 'begin')).rejects.toBeInstanceOf(AppError);
    const evs = await all(rig, sessionId);
    const err = evs.find((e) => e.type === 'error');
    expect(err && err.type === 'error' && err.retryable).toBe(true);
    // season and bonds were already on chain and are not repeated on retry
    rig.llm.policy.failFor = [];
    await step(rig.deps, sessionId, 'begin');
    const t = types(await all(rig, sessionId));
    expect(t.filter((x) => x === 'season_created')).toHaveLength(1);
    expect(t.filter((x) => x === 'bond_posted')).toHaveLength(5);
    expect(t).toContain('day_opened');
  });
});

describe('cartel outcomes', () => {
  it('fewer than two signers means no pact, an honest outcome; leniency then ends in holdout', async () => {
    const rig = makeRig({ sign: ['marlow'] });
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, tx.hash);
    expect(r.confessor).toBeNull();
    const t = types(await all(rig, sessionId));
    expect(t).toContain('holdout');
    expect(t).not.toContain('deliberating');
    expect(rig.llm.calls.filter((c) => c.kind === 'deliberate')).toHaveLength(0);
  });

  it('two signers form a pact between exactly those two', async () => {
    const rig = makeRig({ sign: ['ines', 'sully'], confess: [] });
    const { sessionId } = await start(rig);
    // finish quickly: three days
    for (let d = 1; d <= 3; d++) {
      await step(rig.deps, sessionId, 'sell');
      await step(rig.deps, sessionId, 'next_day');
    }
    const cf = await casefile(rig.deps, sessionId);
    expect(cf.pact?.members).toEqual(['sully.house.mock.testnet', 'ines.house.mock.testnet']);
  });
});

describe('leniency', () => {
  it('rejects a tx that is not a real offer_leniency (TX_NOT_FOUND) and a wrong season/player (TX_MISMATCH)', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    await expect(leniency(rig.deps, sessionId, '1'.repeat(44))).rejects.toMatchObject({ code: 'TX_NOT_FOUND' });
    const other = rig.chain.playerOffersLeniency(0, 'someoneelse.testnet');
    await expect(leniency(rig.deps, sessionId, other.hash)).rejects.toMatchObject({ code: 'TX_MISMATCH' });
  });

  it('nobody confesses: holdout, the game goes on, and a second offer the same day is refused', async () => {
    const rig = makeRig({ confess: [] });
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, tx.hash);
    expect(r.confessor).toBeNull();
    expect(r.status.phase).toBe('lot_open');
    const t = types(await all(rig, sessionId));
    expect(t.filter((x) => x === 'deliberating')).toHaveLength(5);
    expect(t).toContain('holdout');
    const tx2 = rig.chain.playerOffersLeniency(0, playerAccountId);
    await expect(leniency(rig.deps, sessionId, tx2.hash)).rejects.toMatchObject({ code: 'BAD_PHASE' });
    // next day the window is a fresh one
    await step(rig.deps, sessionId, 'sell');
    await step(rig.deps, sessionId, 'next_day');
    const tx3 = rig.chain.playerOffersLeniency(0, playerAccountId);
    await expect(leniency(rig.deps, sessionId, tx3.hash)).resolves.toMatchObject({ ok: true });
  });

  it('a confession race has exactly one winner; the rest get E_ALREADY_CONFESSED and are slashed', async () => {
    const rig = makeRig({ confess: ['sully', 'ines', 'odile'] });
    const { sessionId, playerAccountId } = await start(rig);
    await step(rig.deps, sessionId, 'sell');
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, tx.hash);
    expect(r.confessor).not.toBeNull();
    expect(r.status.phase).toBe('closed');
    expect(r.status.confessed).toBe(true);
    const evs = await all(rig, sessionId);
    const attempts = evs.filter((e) => e.type === 'confession_attempt');
    expect(attempts).toHaveLength(3);
    const oks = attempts.filter((e) => e.type === 'confession_attempt' && e.ok);
    expect(oks).toHaveLength(1);
    for (const a of attempts) {
      if (a.type === 'confession_attempt' && !a.ok) expect(a.errorCode).toBe('E_ALREADY_CONFESSED');
    }
    const slashed = evs.find((e) => e.type === 'slashed');
    expect(slashed && slashed.type === 'slashed' && slashed.slashed).toHaveLength(4);
    expect(slashed && slashed.type === 'slashed' && slashed.slashed.some((x) => x.buyer === r.confessor)).toBe(false);
    expect(slashed && slashed.type === 'slashed' && BigInt(slashed.payoutYocto)).toBe(4n * 200_000_000_000_000_000_000_000n);
    expect(types(evs).at(-1)).toBe('season_closed');
    const cf = await casefile(rig.deps, sessionId);
    expect((cf.chain as { status: string }).status).toBe('Closed');
  });

  it('leniency is refused once the season is closed', async () => {
    const rig = makeRig({ confess: ['sully'] });
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    await leniency(rig.deps, sessionId, tx.hash);
    await expect(leniency(rig.deps, sessionId, tx.hash)).rejects.toMatchObject({ code: 'BAD_PHASE' });
  });

  it('a model failure during deliberation is reported and the offer can be repeated', async () => {
    const rig = makeRig({ confess: [] });
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    rig.llm.policy.failFor = ['deacon'];
    await expect(leniency(rig.deps, sessionId, tx.hash)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    const t = types(await all(rig, sessionId));
    expect(t).not.toContain('holdout');
    rig.llm.policy.failFor = [];
    await expect(leniency(rig.deps, sessionId, tx.hash)).resolves.toMatchObject({ confessor: null });
  });
});
