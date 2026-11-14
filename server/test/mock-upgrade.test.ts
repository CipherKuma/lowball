// The MockChain implements the upgraded contract rules (contract/INTERFACE.md): yield window, 200-block
// timeout, NEP-245 tokens, payout_evm and its payout_route, gas for confess. These are the rules the engine
// tests below rely on, so they are pinned here against the documented behaviour.
import { describe, expect, it } from 'vitest';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { YIELD_BLOCKS } from '../src/chain/mock.js';
import { mintsOf, parseEventLogs, transfersOf } from '../src/near/events.js';
import { toB64 } from '../src/near/bytes.js';
import { pactToJson, randomNonce, signConfession, signPact, sigToJson } from '../src/near/pact.js';
import { makeRig } from './helpers.js';

const BOND = 200_000_000_000_000_000_000_000n;
const EVM = '0x' + 'ab'.repeat(20);

async function season(opts: { payoutEvm?: string; days?: number } = {}) {
  const rig = makeRig();
  const { chain, deps } = rig;
  const player = 'p1.house.mock.testnet';
  const accts = BUYER_IDS.map((id) => `${id}.${chain.houseId}`);
  const cs = await chain.createSeason(player, accts, opts.days ?? 3, BOND, opts.payoutEvm);
  if (!cs.ok) throw new Error(`create_season ${cs.errorCode}`);
  const id = cs.seasonId!;
  for (const b of BUYER_IDS) await chain.postBond(b, id, BOND);
  const confess = (b: BuyerId, o?: { payoutEvm?: boolean }) => {
    const members: BuyerId[] = ['marlow', 'odile', 'sully'];
    const pact = { seasonId: id, cap: 50, members: members.map((m) => `${m}.${chain.houseId}`), nonce: randomNonce() };
    const sigs = members.map((m) => sigToJson(`${m}.${chain.houseId}`, signPact(pact, deps.pactKeys[m])));
    const confessionSig = toB64(signConfession(id, `${b}.${chain.houseId}`, pact.nonce, deps.pactKeys[b]));
    return chain.confess(b, id, pactToJson(pact), sigs, { ...o, confessionSig });
  };
  return { rig, chain, id, player, confess };
}

describe('MockChain: NEP-245 catch tokens', () => {
  it('open_lot requires weight_kg > 0 and mints s{season}-d{day} into escrow with an mt_mint log', async () => {
    const { chain, id } = await season();
    expect((await chain.openLot(id, 'halibut', 120, 0)).errorCode).toBe('E_BAD_ARGS');
    const r = await chain.openLot(id, 'halibut', 120, 87);
    expect(r.ok).toBe(true);
    expect(mintsOf(r.logs)).toEqual([{ tokenId: `s${id}-d1`, amount: 87, owner: chain.contractId }]);
    const lot = (await chain.getSeason(id)).lots[0]!;
    expect(lot).toMatchObject({ weight_kg: 87, token_id: `s${id}-d1`, token_owner: chain.contractId });
    const ev = parseEventLogs(r.logs)[0]!;
    expect(ev).toMatchObject({ standard: 'nep245', version: '1.0.0', event: 'mt_mint' });
  });

  it('settle_lot transfers the token to the winner with memo "sold at <price> marks"', async () => {
    const { rig, chain, id } = await season();
    await chain.openLot(id, 'lobster', 200, 40);
    const salt = new Uint8Array(32).fill(7);
    const { commitmentHash } = await import('../src/game/days.js');
    for (const [i, b] of BUYER_IDS.entries()) {
      const amount = 50 + i;
      await chain.commitBid(b, id, commitmentHash(amount, salt));
      await chain.revealBid(b, id, amount, salt);
    }
    const r = await chain.settleLot(id);
    expect(transfersOf(r.logs)).toEqual([
      { tokenId: `s${id}-d1`, from: chain.contractId, to: `deacon.${chain.houseId}`, amount: 40, memo: 'sold at 54 marks' },
    ]);
    expect((await chain.getSeason(id)).lots[0]!.token_owner).toBe(`deacon.${chain.houseId}`);
    void rig;
  });

  it('an unsold open lot returns to the player (memo "returned unsold") on confession and on close', async () => {
    const a = await season();
    await a.chain.openLot(a.id, 'monkfish', 100, 70);
    a.chain.playerOffersLeniency(a.id, a.player);
    const c = await a.confess('marlow');
    expect(c.ok).toBe(true);
    expect(transfersOf(c.logs)[0]).toMatchObject({ to: a.player, memo: 'returned unsold', amount: 70 });
    const b = await season();
    await b.chain.openLot(b.id, 'monkfish', 100, 70);
    const closed = await b.chain.closeSeason(b.id);
    expect(transfersOf(closed.logs)[0]).toMatchObject({ to: b.player, memo: 'returned unsold' });
  });
});

describe('MockChain: NEP-519 leniency yield', () => {
  it('offer opens a window with open and deadline (open + 200) blocks; a second offer while live fails E_LENIENCY_OPEN', async () => {
    const { chain, id, player } = await season();
    await chain.openLot(id, 'sea bass', 150, 60);
    const o = chain.playerOffersLeniency(id, player);
    expect(o.ok).toBe(true);
    const v = await chain.getSeason(id);
    expect(v.leniency_open).toBe(true);
    expect(v.leniency_deadline_block).toBe(v.leniency_open_block! + YIELD_BLOCKS);
    expect(v.leniency_windows).toBe(1);
    const again = chain.playerOffersLeniency(id, player);
    expect(again.errorCode).toBe('E_LENIENCY_OPEN');
    expect(await chain.verifyLeniencyTx(o.hash, player, id)).toMatchObject({ ok: true, deadlineBlock: v.leniency_deadline_block });
  });

  it('only the player may offer, and not before day 1', async () => {
    const { chain, id, player } = await season();
    expect(chain.playerOffersLeniency(id, player).errorCode).toBe('E_NO_DAY');
    await chain.openLot(id, 'sea bass', 150, 60);
    expect(chain.playerOffersLeniency(id, 'mallory.testnet').errorCode).toBe('E_NOT_PLAYER');
  });

  it('after 200 blocks with no confession the window closes, holdouts counts it, and a new window may open', async () => {
    const { chain, id, player, confess } = await season();
    await chain.openLot(id, 'sea bass', 150, 60);
    chain.playerOffersLeniency(id, player);
    chain.advanceBlocks(YIELD_BLOCKS - 5);
    expect((await chain.getSeason(id)).leniency_open).toBe(true);
    chain.advanceBlocks(10);
    const v = await chain.getSeason(id);
    expect(v).toMatchObject({ leniency_open: false, holdouts: 1, leniency_open_block: null, leniency_deadline_block: null });
    expect((await confess('marlow')).errorCode).toBe('E_NO_LENIENCY');
    expect(chain.playerOffersLeniency(id, player).ok).toBe(true);
    expect((await chain.getSeason(id)).leniency_windows).toBe(2);
  });

  it('a confession inside the window resumes the yield: no holdout is ever counted', async () => {
    const { chain, id, player, confess } = await season();
    await chain.openLot(id, 'sea bass', 150, 60);
    chain.playerOffersLeniency(id, player);
    expect((await confess('marlow')).ok).toBe(true);
    chain.advanceBlocks(YIELD_BLOCKS * 2);
    expect(await chain.getSeason(id)).toMatchObject({ holdouts: 0, status: 'Confessed', leniency_open: false });
  });

  it('opening the next day kills the old window (confess is E_NO_LENIENCY)', async () => {
    const { chain, id, player, confess } = await season();
    await chain.openLot(id, 'sea bass', 150, 60);
    chain.playerOffersLeniency(id, player);
    const salt = new Uint8Array(32).fill(1);
    const { commitmentHash } = await import('../src/game/days.js');
    for (const b of BUYER_IDS) {
      await chain.commitBid(b, id, commitmentHash(60, salt));
      await chain.revealBid(b, id, 60, salt);
    }
    await chain.settleLot(id);
    await chain.openLot(id, 'sea bass', 150, 60);
    expect((await confess('marlow')).errorCode).toBe('E_NO_LENIENCY');
    expect((await chain.getSeason(id)).leniency_open).toBe(false);
  });

  it('confession events carry confession and slash EVENT_JSON lines', async () => {
    const { chain, id, player, confess } = await season();
    await chain.openLot(id, 'sea bass', 150, 60);
    chain.playerOffersLeniency(id, player);
    const r = await confess('odile');
    const names = parseEventLogs(r.logs).map((e) => `${e.standard}:${e.event}`);
    expect(names).toContain('lowball:confession');
    expect(names).toContain('lowball:slash');
  });
});

describe('MockChain: payout_evm', () => {
  it('create_season validates the address (E_BAD_EVM) and the view reports it', async () => {
    const rig = makeRig();
    const accts = BUYER_IDS.map((id) => `${id}.${rig.chain.houseId}`);
    for (const bad of ['0x123', 'ab'.repeat(20), '0x' + 'zz'.repeat(20), '']) {
      expect((await rig.chain.createSeason('p.t', accts, 3, BOND, bad)).errorCode).toBe('E_BAD_EVM');
    }
    const ok = await rig.chain.createSeason('p.t', accts, 3, BOND, EVM);
    expect((await rig.chain.getSeason(ok.seasonId!)).payout_evm).toBe(EVM);
    const plain = await rig.chain.createSeason('p.t', accts, 3, BOND);
    expect(await rig.chain.getSeason(plain.seasonId!)).toMatchObject({ payout_evm: null, payout_route: 'none' });
  });

  it('confess in a payout_evm season needs the 250 Tgas attach: without it the success path fails', async () => {
    const { chain, id, player, confess } = await season({ payoutEvm: EVM });
    await chain.openLot(id, 'sea bass', 150, 60);
    chain.playerOffersLeniency(id, player);
    expect((await confess('marlow', { payoutEvm: false })).errorCode).toBe('TX_FAILED');
    expect((await chain.getSeason(id)).status).toBe('Open');
    expect((await confess('marlow', { payoutEvm: true })).ok).toBe(true);
  });

  it('payout_route goes evm_pending then evm; a failing desk ends in evm_failed_near with the NEAR still recorded', async () => {
    const a = await season({ payoutEvm: EVM });
    await a.chain.openLot(a.id, 'sea bass', 150, 60);
    a.chain.playerOffersLeniency(a.id, a.player);
    await a.confess('marlow', { payoutEvm: true });
    expect((await a.chain.getSeason(a.id)).payout_route).toBe('evm_pending');
    a.chain.advanceBlocks(5);
    expect((await a.chain.getSeason(a.id)).payout_route).toBe('evm');

    const b = await season({ payoutEvm: EVM });
    b.chain.deskFails = true;
    await b.chain.openLot(b.id, 'sea bass', 150, 60);
    b.chain.playerOffersLeniency(b.id, b.player);
    await b.confess('marlow', { payoutEvm: true });
    b.chain.advanceBlocks(5);
    const v = await b.chain.getSeason(b.id);
    expect(v.payout_route).toBe('evm_failed_near');
    expect(BigInt(v.player_payout)).toBe(2n * BOND);
  });

  it('a plain season pays NEAR: route "near"', async () => {
    const { chain, id, player, confess } = await season();
    await chain.openLot(id, 'sea bass', 150, 60);
    chain.playerOffersLeniency(id, player);
    await confess('marlow');
    expect((await chain.getSeason(id)).payout_route).toBe('near');
  });
});

describe('EVENT_JSON parsing', () => {
  it('skips malformed and foreign lines and keeps well-formed events', () => {
    const logs = [
      'hello',
      'EVENT_JSON:{not json',
      'EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":"mt_mint","data":[{"owner_id":"c.t","token_ids":["s1-d1"],"amounts":["42"]}]}',
      'EVENT_JSON:{"standard":"x"}',
    ];
    expect(parseEventLogs(logs)).toHaveLength(1);
    expect(mintsOf(logs)).toEqual([{ tokenId: 's1-d1', amount: 42, owner: 'c.t' }]);
    expect(transfersOf(logs)).toEqual([]);
    expect(mintsOf(undefined)).toEqual([]);
  });
});
