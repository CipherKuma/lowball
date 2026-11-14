// Engine behaviour on the upgraded contract: token events, the on-chain holdout, the cross-chain payout.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../shared/api.js';
import { ChainsigError } from '../src/chainsig/types.js';
import type { PayoutRelay } from '../src/game/ctx.js';
import { createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { lotFor, SPECIES } from '../src/game/lots.js';
import { makeRig, PLAYER_PK, type Rig } from './helpers.js';

const EVM = '0x' + '5e'.repeat(20);
const types = (evs: GameEvent[]) => evs.map((e) => e.type);
const all = async (rig: Rig, id: string) => (await getEvents(rig.deps, id, 0)).events;

async function start(rig: Rig, payoutEvm?: string) {
  const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4', payoutEvm);
  await step(rig.deps, created.sessionId, 'begin');
  return created;
}

function relay(impl: PayoutRelay['relay']): PayoutRelay & { calls: number } {
  const r = { calls: 0, relay: (...a: Parameters<PayoutRelay['relay']>) => (r.calls++, impl(...a)) };
  return r;
}
const SIGNED = { to: EVM, amountWei: '800000000000000', sepoliaTx: '0x' + 'cd'.repeat(32), status: 'success' as const };

describe('NEP-245 events', () => {
  it('begin emits day_opened then lot_minted with the token id, kg and the open_lot tx', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    const evs = await all(rig, sessionId);
    const opened = evs.find((e) => e.type === 'day_opened')!;
    const minted = evs.find((e) => e.type === 'lot_minted')!;
    expect(minted.seq).toBeGreaterThan(opened.seq);
    if (opened.type !== 'day_opened' || minted.type !== 'lot_minted') throw new Error('shape');
    expect(minted).toMatchObject({ tokenId: 's0-d1', amount: opened.weightKg, tx: opened.tx });
  });

  it('the chain was told the weight (open_lot weight_kg)', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    const day = (await all(rig, sessionId)).find((e) => e.type === 'day_opened');
    expect((await rig.chain.getSeason(0)).lots[0]!.weight_kg).toBe(day && day.type === 'day_opened' ? day.weightKg : -1);
  });

  it('sell emits lot_transferred after lot_settled: token, winner account, buyer id, memo, settle tx', async () => {
    const rig = makeRig({ bid: (b) => (b === 'ines' ? 70 : 60) });
    const { sessionId } = await start(rig);
    await step(rig.deps, sessionId, 'sell');
    const evs = await all(rig, sessionId);
    const settled = evs.find((e) => e.type === 'lot_settled')!;
    const moved = evs.find((e) => e.type === 'lot_transferred')!;
    expect(moved.seq).toBeGreaterThan(settled.seq);
    if (moved.type !== 'lot_transferred' || settled.type !== 'lot_settled') throw new Error('shape');
    expect(moved).toMatchObject({ tokenId: 's0-d1', to: 'ines.house.mock.testnet', buyer: 'ines', memo: 'sold at 70 marks', tx: settled.tx });
  });

  it('every day of a season mints and transfers its own token', async () => {
    const rig = makeRig();
    const { sessionId } = await start(rig);
    for (let d = 1; d <= 3; d++) {
      await step(rig.deps, sessionId, 'sell');
      await step(rig.deps, sessionId, 'next_day');
    }
    const t = types(await all(rig, sessionId));
    expect(t.filter((x) => x === 'lot_minted')).toHaveLength(3);
    expect(t.filter((x) => x === 'lot_transferred')).toHaveLength(3);
  });

  it('a lot is never minted or transferred by guesswork: no receipt log, no event', async () => {
    const rig = makeRig();
    const real = rig.chain.openLot.bind(rig.chain);
    rig.chain.openLot = async (...a) => ({ ...(await real(...a)), logs: [] });
    const { sessionId } = await start(rig);
    expect(types(await all(rig, sessionId))).not.toContain('lot_minted');
  });
});

describe('species', () => {
  it('only the six species that have art', () => {
    expect(SPECIES.map((s) => s[0]).sort()).toEqual(['Atlantic cod', 'bluefin tuna', 'halibut', 'lobster', 'monkfish', 'sea bass']);
    const seen = new Set<string>();
    for (let seed = 1; seed < 400; seed++) {
      const lot = lotFor(seed, (seed % 20) + 1);
      seen.add(lot.species);
      expect(lot.weightKg).toBeGreaterThan(0);
      expect(lot.fairValue).toBeGreaterThanOrEqual(60);
      expect(lot.fairValue).toBeLessThanOrEqual(320);
    }
    expect([...seen].sort()).toEqual(['Atlantic cod', 'bluefin tuna', 'halibut', 'lobster', 'monkfish', 'sea bass']);
  });
});

describe('leniency is a pending yield', () => {
  it('leniency_open carries the on-chain deadline block (open + 200)', async () => {
    const rig = makeRig();
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const open = (await rig.chain.getSeason(0)).leniency_open_block!;
    await leniency(rig.deps, sessionId, tx.hash);
    const e = (await all(rig, sessionId)).find((x) => x.type === 'leniency_open')!;
    expect(e.type === 'leniency_open' && e.deadlineBlock).toBe(open + 200);
  });

  it('a failed offer (E_LENIENCY_OPEN: window already live) is not accepted as a leniency tx', async () => {
    const rig = makeRig();
    const { sessionId, playerAccountId } = await start(rig);
    rig.chain.playerOffersLeniency(0, playerAccountId);
    const second = rig.chain.playerOffersLeniency(0, playerAccountId);
    await expect(leniency(rig.deps, sessionId, second.hash)).rejects.toMatchObject({ code: 'E_LENIENCY_OPEN' });
  });

  it('nobody confesses: holdout{reason:"timeout"} is emitted only after the contract closed the window', async () => {
    const rig = makeRig({ confess: [] });
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    expect((await rig.chain.getSeason(0)).leniency_open).toBe(true);
    const r = await leniency(rig.deps, sessionId, tx.hash);
    expect(r.confessor).toBeNull();
    const v = await rig.chain.getSeason(0);
    expect(v.leniency_open).toBe(false);
    expect(v.holdouts).toBe(1); // the chain counted it too
    const evs = await all(rig, sessionId);
    const h = evs.find((e) => e.type === 'holdout')!;
    expect(h.type === 'holdout' && h.reason).toBe('timeout');
    expect(types(evs).indexOf('holdout')).toBeGreaterThan(types(evs).lastIndexOf('deliberating'));
  });

  it('fewer than two signers: holdout{reason:"no_pact"}, no model call, buyers just do not confess', async () => {
    const rig = makeRig({ sign: ['marlow'] });
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    await leniency(rig.deps, sessionId, tx.hash);
    const h = (await all(rig, sessionId)).find((e) => e.type === 'holdout')!;
    expect(h.type === 'holdout' && h.reason).toBe('no_pact');
    expect(rig.llm.calls.filter((c) => c.kind === 'deliberate')).toHaveLength(0);
  });

  it('if the window is still open when the request budget ends, the request returns, no holdout is faked, and event polls finish it', async () => {
    const rig = makeRig({ confess: [] });
    let t = 1_000_000;
    rig.deps.now = () => t;
    rig.deps.waitMs = 5_000;
    rig.deps.pollMs = 1_000;
    // wall-clock moves 1 s per wait but the chain barely moves: the window outlasts the request
    rig.deps.sleep = async () => {
      t += 1_000;
      rig.chain.advanceBlocks(5);
    };
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, tx.hash);
    expect(r.confessor).toBeNull();
    expect(r.status.finalizing).toBe(true);
    expect(r.status.leniencyAvailable).toBe(false);
    expect(types(await all(rig, sessionId))).not.toContain('holdout');
    // meanwhile the game cannot move on and kill the window
    await expect(step(rig.deps, sessionId, 'sell')).rejects.toMatchObject({ code: 'BAD_PHASE' });
    // the chain reaches the deadline; the next events polls resume and the contract's answer becomes the event
    rig.chain.advanceBlocks(300);
    t += 10_000;
    const polled = await getEvents(rig.deps, sessionId, 0);
    const h = polled.events.find((e) => e.type === 'holdout')!;
    expect(h.type === 'holdout' && h.reason).toBe('timeout');
    expect(polled.status.finalizing).toBe(false);
    await expect(step(rig.deps, sessionId, 'sell')).resolves.toMatchObject({ ok: true });
  });

  it('a confession race with a window that has not timed out still closes the season immediately (no payout route)', async () => {
    const rig = makeRig({ confess: ['sully', 'ines'] });
    const { sessionId, playerAccountId } = await start(rig);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, tx.hash);
    expect(r.status.phase).toBe('closed');
    expect(types(await all(rig, sessionId)).filter((x) => x === 'holdout')).toHaveLength(0);
    expect((await rig.chain.getSeason(0)).holdouts).toBe(0);
  });
});

describe('cross-chain payout (payoutEvm)', () => {
  const confessRig = (relayImpl?: PayoutRelay) => {
    const rig = makeRig({ confess: ['sully', 'ines', 'odile'] });
    if (relayImpl) rig.deps.payout = relayImpl;
    return rig;
  };
  const offer = async (rig: Rig, payout?: string) => {
    const { sessionId, playerAccountId } = await start(rig, payout);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    return { sessionId, res: await leniency(rig.deps, sessionId, tx.hash) };
  };

  it('createSession passes the address to create_season and echoes it', async () => {
    const rig = makeRig();
    const created = await createSession(rig.deps, PLAYER_PK, 'ip', EVM);
    expect(created.payoutEvm).toBe(EVM);
    await step(rig.deps, created.sessionId, 'begin');
    expect((await rig.chain.getSeason(0)).payout_evm).toBe(EVM);
    expect((await createSession(rig.deps, PLAYER_PK, 'ip')).payoutEvm).toBeNull();
  });

  it('confess is sent with 250 Tgas for a payout_evm season and a payout_evm event follows slashed, before season_closed', async () => {
    const r = relay(async () => SIGNED);
    const rig = confessRig(r);
    const { sessionId, res } = await offer(rig, EVM);
    expect(res.confessor).not.toBeNull();
    const evs = await all(rig, sessionId);
    const slashed = evs.find((e) => e.type === 'slashed')!;
    const paid = evs.find((e) => e.type === 'payout_evm')!;
    const closed = evs.find((e) => e.type === 'season_closed')!;
    expect(slashed.seq).toBeLessThan(paid.seq);
    expect(paid.seq).toBeLessThan(closed.seq);
    if (paid.type !== 'payout_evm' || slashed.type !== 'slashed') throw new Error('shape');
    expect(paid).toMatchObject({ to: EVM, amountWei: SIGNED.amountWei, sepoliaTx: SIGNED.sepoliaTx, status: 'success' });
    expect(paid.nearTx).toBe(slashed.tx); // the winning confess transaction
    expect(slashed.payoutRoute).toBe('evm_pending');
    expect(r.calls).toBe(1);
    expect(rig.chain.log.filter((l) => l.label === 'confess' && l.errorCode === 'TX_FAILED')).toHaveLength(0);
    expect((await getEvents(rig.deps, sessionId, 0)).status.phase).toBe('closed');
  });

  it('a season without payoutEvm never calls the relayer and emits no payout_evm', async () => {
    const r = relay(async () => SIGNED);
    const rig = confessRig(r);
    const { sessionId } = await offer(rig);
    expect(r.calls).toBe(0);
    expect(types(await all(rig, sessionId))).not.toContain('payout_evm');
  });

  it('relayer failure: error{PAYOUT_EVM_FAILED, retryable:true}, the NEAR payout is still reported, the season closes', async () => {
    const rig = confessRig(relay(async () => { throw new ChainsigError('UNDERFUNDED', 'desk address holds 0 wei'); }));
    const { sessionId } = await offer(rig, EVM);
    const evs = await all(rig, sessionId);
    const err = evs.find((e) => e.type === 'error')!;
    expect(err).toMatchObject({ type: 'error', code: 'PAYOUT_EVM_FAILED', retryable: true });
    expect(types(evs)).not.toContain('payout_evm'); // never a fabricated Sepolia hash
    const slashed = evs.find((e) => e.type === 'slashed')!;
    expect(slashed.type === 'slashed' && BigInt(slashed.payoutYocto)).toBe(4n * 200_000_000_000_000_000_000_000n);
    expect(types(evs).at(-1)).toBe('season_closed');
  });

  it('no relayer configured is reported the same way', async () => {
    const rig = confessRig();
    const { sessionId } = await offer(rig, EVM);
    const evs = await all(rig, sessionId);
    expect(evs.find((e) => e.type === 'error')).toMatchObject({ code: 'PAYOUT_EVM_FAILED', retryable: true });
    expect(types(evs).at(-1)).toBe('season_closed');
  });

  it('desk failure (payout_route evm_failed_near): honest error, not retryable, no Sepolia event, relayer untouched', async () => {
    const r = relay(async () => SIGNED);
    const rig = confessRig(r);
    rig.chain.deskFails = true;
    const { sessionId } = await offer(rig, EVM);
    const evs = await all(rig, sessionId);
    const err = evs.find((e) => e.type === 'error')!;
    expect(err).toMatchObject({ code: 'PAYOUT_EVM_FAILED', retryable: false });
    expect(err.type === 'error' && err.message).toMatch(/NEAR instead/);
    expect(types(evs)).not.toContain('payout_evm');
    expect(r.calls).toBe(0);
    expect((await rig.chain.getSeason(0)).payout_route).toBe('evm_failed_near');
  });

  it('the MPC signature is late: the request returns, the phase stays put, and event polls finish the payout', async () => {
    let attempt = 0;
    const r = relay(async () => {
      if (++attempt < 3) throw new ChainsigError('PAYOUT_PENDING', 'signature not here yet');
      return SIGNED;
    });
    const rig = confessRig(r);
    let t = 5_000_000;
    rig.deps.now = () => t;
    rig.deps.sleep = async () => {
      t += 1_000;
      rig.chain.advanceBlocks(5);
    };
    const { sessionId, res } = await offer(rig, EVM);
    expect(res.status.phase).not.toBe('closed');
    expect(res.status.finalizing).toBe(true);
    expect(res.status.confessed).toBe(true);
    expect(types(await all(rig, sessionId))).not.toContain('season_closed');
    for (let i = 0; i < 5 && (await getEvents(rig.deps, sessionId, 0)).status.phase !== 'closed'; i++) t += 3_000;
    const evs = await all(rig, sessionId);
    expect(types(evs)).toContain('payout_evm');
    expect(types(evs).at(-1)).toBe('season_closed');
    expect(r.calls).toBe(3);
  });

  it('a reverted Sepolia tx reports payout_evm with status reverted and an error', async () => {
    const rig = confessRig(relay(async () => ({ ...SIGNED, status: 'reverted' as const })));
    const { sessionId } = await offer(rig, EVM);
    const evs = await all(rig, sessionId);
    expect(evs.find((e) => e.type === 'payout_evm')).toMatchObject({ status: 'reverted' });
    expect(evs.find((e) => e.type === 'error')).toMatchObject({ code: 'PAYOUT_EVM_FAILED', retryable: true });
  });
});
