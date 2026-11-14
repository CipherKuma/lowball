// A mocked chain that enforces the same contract rules and error codes as contract/src, in the
// same check order. Used by the unit tests and by the sim harness (never by the Worker).
import { sha256 } from '@noble/hashes/sha256';
import { BUYER_IDS, type BuyerId, type ErrorCode } from '../../../shared/api.js';
import { b58encode } from '../near/base58.js';
import { concat, fromB64, toB64, utf8 } from '../near/bytes.js';
import { verify } from '../near/keys.js';
import { PACT_PREFIX, encodePact, verifyConfessionSig } from '../near/pact.js';
import { mockEvent } from './mock-events.js';
import { ensure, Panic, type Lot, type Season } from './mock-state.js';
import type { Chain, ConfessOptions, LeniencyCheck, PactJson, PactSigJson, SeasonView, TxResult } from './types.js';

/** protocol constant: the NEP-519 yield times out 200 blocks after offer_leniency (contract/INTERFACE.md) */
export const YIELD_BLOCKS = 200;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export class MockChain implements Chain {
  readonly contractId = 'lowball.mock.testnet';
  readonly houseId = 'house.mock.testnet';
  private seasons: Season[] = [];
  private counter = 0;
  private offered = new Map<string, { player: string; seasonId: number; ok: boolean; errorCode?: ErrorCode }>();
  treasury = 100n * 10n ** 24n;
  /** simulated NEAR block height: +1 per tx, plus advanceBlocks() */
  height = 1_000_000;
  /** make the payout desk fail, so payout_route resolves to evm_failed_near */
  deskFails = false;
  /** blocks after a payout_evm confession until the desk callback resolves the route */
  routeDelayBlocks = 3;
  /** every tx processed, in order, for assertions */
  log: { label: string; hash: string; signer: string; ok: boolean; errorCode?: ErrorCode; logs?: string[] }[] = [];

  /** registered pact keys (register_buyer_key); seasons snapshot them at create_season */
  private pactPublicKeys: Record<BuyerId, Uint8Array>;
  constructor(pactPublicKeys: Record<BuyerId, Uint8Array>) {
    this.pactPublicKeys = { ...pactPublicKeys };
  }

  async getBuyerKey(accountId: string): Promise<string | null> {
    const id = BUYER_IDS.find((x) => this.acct(x) === accountId);
    return id ? toB64(this.pactPublicKeys[id]) : null;
  }

  async registerBuyerKey(buyer: BuyerId, publicKeyB64: string): Promise<TxResult> {
    await Promise.resolve();
    return this.tx('register_buyer_key', this.acct(buyer), () => {
      const pk = fromB64(publicKeyB64);
      ensure(pk.length === 32, 'E_BAD_KEY');
      this.pactPublicKeys[buyer] = pk;
    });
  }

  advanceBlocks(n: number) {
    this.height += n;
  }

  private tx(label: string, signer: string, fn: (logs: string[]) => void): TxResult {
    const hash = b58encode(sha256(utf8(`mock-tx-${++this.counter}`)));
    this.height += 1;
    const logs: string[] = [];
    try {
      fn(logs);
      this.log.push({ label, hash, signer, ok: true, logs });
      return { hash, ok: true, logs };
    } catch (e) {
      if (!(e instanceof Panic)) throw e;
      this.log.push({ label, hash, signer, ok: false, errorCode: e.code });
      return { hash, ok: false, errorCode: e.code, failure: `Smart contract panicked: ${e.code}` };
    }
  }

  /** Resolve yielded receipts that timed out, like the contract's on_leniency_end callback. */
  private tick(s: Season) {
    const w = s.win;
    if (w?.pending && this.height > w.openBlock + YIELD_BLOCKS) {
      w.pending = false;
      if (s.status === 'Open') s.holdouts += 1;
    }
    if (s.payoutRoute === 'evm_pending' && this.height >= s.routeAt) s.payoutRoute = this.deskFails ? 'evm_failed_near' : 'evm';
  }
  private live(s: Season): boolean {
    this.tick(s);
    const w = s.win;
    return !!w && w.pending && w.day === s.day && this.height <= w.openBlock + YIELD_BLOCKS && s.status === 'Open';
  }

  private season(id: number): Season {
    const s = this.seasons[id];
    ensure(!!s, 'E_NO_SEASON');
    return s!;
  }
  private idx(s: Season, acct: string): number {
    return s.buyers.indexOf(acct);
  }
  private buyerIdx(s: Season, acct: string): number {
    const i = this.idx(s, acct);
    ensure(i >= 0, 'E_NOT_BUYER');
    return i;
  }
  private ensureOpen(s: Season) {
    if (s.status === 'Closed') throw new Panic('E_CLOSED');
    if (s.status === 'Confessed') throw new Panic('E_SEASON_OVER');
  }
  private acct(b: BuyerId) {
    return `${b}.${this.houseId}`;
  }
  /** an open lot that never sold goes back to the player (confession or close) */
  private returnUnsold(s: Season, id: number, logs: string[]) {
    const l = s.lots[s.lots.length - 1];
    if (!l || l.settled || l.token_owner !== this.contractId) return;
    l.token_owner = s.player;
    logs.push(mockEvent('nep245', 'mt_transfer', { old_owner_id: this.contractId, new_owner_id: s.player, token_ids: [l.token_id], amounts: [String(l.weight_kg)], memo: 'returned unsold' }));
    void id;
  }

  async houseBalance() {
    return this.treasury;
  }
  async blockHeight() {
    return this.height;
  }
  async createPlayer(): Promise<{ accountId: string; tx: TxResult }> {
    const accountId = `pmock${++this.counter}.${this.houseId}`;
    return { accountId, tx: this.tx('create_player', this.houseId, () => undefined) };
  }
  async ensureBuyerFunds() {
    return null;
  }

  async createSeason(player: string, buyers: string[], days: number, bond: bigint, payoutEvm?: string) {
    let seasonId: number | undefined;
    const r = this.tx('create_season', this.houseId, () => {
      ensure(buyers.length === 5, 'E_BAD_ARGS');
      ensure(days >= 1 && days <= 30 && bond > 0n, 'E_BAD_ARGS');
      buyers.forEach((b, i) => ensure(!buyers.slice(0, i).includes(b) && b !== player, 'E_BAD_ARGS'));
      const pk = buyers.map((b) => {
        const id = BUYER_IDS.find((x) => this.acct(x) === b);
        ensure(!!id, 'E_NO_KEY');
        return this.pactPublicKeys[id!];
      });
      ensure(payoutEvm === undefined || EVM_ADDRESS.test(payoutEvm), 'E_BAD_EVM');
      this.seasons.push({
        player, buyers, posted: buyers.map(() => false), slashed: buyers.map(() => false),
        refunded: buyers.map(() => false), pk, bond, days, day: 0, status: 'Open', lots: [],
        leniencyDay: null, win: null, windows: 0, holdouts: 0, payoutEvm: payoutEvm ?? null,
        payoutRoute: 'none', routeAt: 0, firstConfessor: null, verified: [], slashedTotal: 0n, payout: 0n,
        shortfall: 0, pactCap: null, pactNonce: null, confessedDay: null,
      });
      seasonId = this.seasons.length - 1;
    });
    return { ...r, seasonId };
  }

  async postBond(b: BuyerId, id: number, bond: bigint) {
    return this.tx('post_bond', this.acct(b), () => {
      const s = this.season(id);
      this.ensureOpen(s);
      const i = this.buyerIdx(s, this.acct(b));
      ensure(!s.posted[i], 'E_BOND_POSTED');
      ensure(bond === s.bond, 'E_BAD_DEPOSIT');
      s.posted[i] = true;
    });
  }

  async openLot(id: number, species: string, fairValue: number, weightKg: number) {
    return this.tx('open_lot', this.houseId, (logs) => {
      const s = this.season(id);
      this.ensureOpen(s);
      ensure(species.length > 0 && species.length <= 64 && fairValue > 0 && weightKg > 0, 'E_BAD_ARGS');
      ensure(s.posted.every(Boolean), 'E_BONDS_MISSING');
      ensure(s.lots.length === 0 || s.lots[s.lots.length - 1]!.settled, 'E_LOT_OPEN');
      ensure(s.day < s.days, 'E_PAST_DAYS');
      s.day += 1;
      const token_id = `s${id}-d${s.day}`;
      s.lots.push({
        day: s.day, species, fair_value: fairValue, weight_kg: weightKg, token_id, token_owner: this.contractId,
        committed: [], reveals: [], settled: false, winner: null, price: 0, identical: false, commits: new Map(), revealMap: [],
      });
      logs.push(mockEvent('nep245', 'mt_mint', { owner_id: this.contractId, token_ids: [token_id], amounts: [String(weightKg)], memo: `escrow for ${s.player}` }));
    });
  }

  private openLotOf(s: Season): Lot {
    const l = s.lots[s.lots.length - 1];
    ensure(!!l && !l.settled, 'E_NO_LOT');
    return l!;
  }

  async commitBid(b: BuyerId, id: number, hash: Uint8Array) {
    return this.tx('commit_bid', this.acct(b), () => {
      const s = this.season(id);
      this.ensureOpen(s);
      const i = this.buyerIdx(s, this.acct(b));
      ensure(s.posted[i]!, 'E_NO_BOND');
      ensure(hash.length === 32, 'E_BAD_ARGS');
      const lot = this.openLotOf(s);
      ensure(!lot.commits.has(i), 'E_ALREADY_COMMITTED');
      lot.commits.set(i, hex(hash));
    });
  }

  async revealBid(b: BuyerId, id: number, amount: number, salt: Uint8Array) {
    return this.tx('reveal_bid', this.acct(b), () => {
      const s = this.season(id);
      this.ensureOpen(s);
      const i = this.buyerIdx(s, this.acct(b));
      const lot = this.openLotOf(s);
      const commit = lot.commits.get(i);
      ensure(commit !== undefined, 'E_NO_COMMIT');
      ensure(!lot.revealMap.some(([x]) => x === i), 'E_ALREADY_REVEALED');
      ensure(salt.length === 32, 'E_BAD_REVEAL');
      const pre = new Uint8Array(4);
      new DataView(pre.buffer).setUint32(0, amount, true);
      ensure(hex(sha256(concat(pre, salt))) === commit, 'E_BAD_REVEAL');
      lot.revealMap.push([i, amount]);
    });
  }

  async settleLot(id: number) {
    return this.tx('settle_lot', this.houseId, (logs) => {
      const s = this.season(id);
      this.ensureOpen(s);
      const lot = this.openLotOf(s);
      const all = lot.revealMap.length === 5;
      ensure(all || lot.revealMap.length > 0, 'E_NOT_READY');
      let best: [number, number] | null = null;
      for (const [b, a] of lot.revealMap) if (!best || a > best[1]) best = [b, a];
      const [w, price] = best!;
      lot.identical = all && lot.revealMap.every(([, a]) => a === price);
      lot.winner = s.buyers[w]!;
      lot.price = price;
      lot.settled = true;
      lot.commits.clear();
      lot.reveals = lot.revealMap.map(([bi, amount]) => ({ buyer: s.buyers[bi]!, amount }));
      s.shortfall += Math.max(0, lot.fair_value - price);
      lot.token_owner = lot.winner;
      logs.push(mockEvent('nep245', 'mt_transfer', { old_owner_id: this.contractId, new_owner_id: lot.winner, token_ids: [lot.token_id], amounts: [String(lot.weight_kg)], memo: `sold at ${price} marks` }));
    });
  }

  /**
   * Test helper standing in for the browser-signed offer_leniency call. Like the real contract it opens a
   * NEP-519 yield: the window stays pending until a confession or 200 blocks pass; a second offer while it is
   * live fails E_LENIENCY_OPEN.
   */
  playerOffersLeniency(id: number, player: string): TxResult {
    const r = this.tx('offer_leniency', player, (logs) => {
      const s = this.season(id);
      ensure(player === s.player, 'E_NOT_PLAYER');
      ensure(s.day >= 1, 'E_NO_DAY');
      ensure(!this.live(s), 'E_LENIENCY_OPEN');
      this.ensureOpen(s);
      s.leniencyDay = s.day;
      s.windows += 1;
      s.win = { day: s.day, openBlock: this.height, pending: true };
      logs.push(mockEvent('lowball', 'leniency_open', { season_id: id, player, day: s.day, window: s.windows, open_block: this.height, deadline_block: this.height + YIELD_BLOCKS }));
    });
    this.offered.set(r.hash, { player, seasonId: id, ok: r.ok, errorCode: r.errorCode });
    return r;
  }

  async verifyLeniencyTx(hash: string, player: string, seasonId: number): Promise<LeniencyCheck> {
    const o = this.offered.get(hash);
    if (!o) return { ok: false, errorCode: 'TX_NOT_FOUND' };
    if (o.player !== player || o.seasonId !== seasonId) return { ok: false, errorCode: 'TX_MISMATCH' };
    if (!o.ok) return { ok: false, errorCode: o.errorCode ?? 'TX_FAILED' };
    const s = this.season(seasonId);
    if (!this.live(s)) return { ok: false, errorCode: 'TX_FAILED', message: 'The leniency window is not open on-chain.' };
    return { ok: true, openBlock: s.win!.openBlock, deadlineBlock: s.win!.openBlock + YIELD_BLOCKS };
  }

  async offerLeniencyAs(accountId: string, _key: unknown, seasonId: number): Promise<TxResult> {
    return this.playerOffersLeniency(seasonId, accountId);
  }

  async confess(b: BuyerId, id: number, pact: PactJson, sigs: PactSigJson[], opts: ConfessOptions = {}) {
    // yield so concurrent confessions interleave like separate transactions
    await Promise.resolve();
    return this.tx('confess', this.acct(b), (logs) => {
      const s = this.season(id);
      const caller = this.acct(b);
      if (s.status === 'Closed') throw new Panic('E_CLOSED');
      if (s.status === 'Confessed') throw new Panic('E_ALREADY_CONFESSED');
      const ci = this.buyerIdx(s, caller);
      ensure(this.live(s), 'E_NO_LENIENCY');
      ensure(pact.season_id === id, 'E_SEASON_MISMATCH');
      ensure(pact.members.every((m) => this.idx(s, m) >= 0), 'E_NOT_MEMBER');
      ensure(pact.members.includes(caller), 'E_NOT_MEMBER');
      pact.members.forEach((m, i) => ensure(!pact.members.slice(0, i).includes(m), 'E_DUP_SIGNER'));
      const msg = concat(
        utf8(PACT_PREFIX),
        encodePact({ seasonId: pact.season_id, cap: pact.cap, members: pact.members, nonce: BigInt(pact.nonce) }),
      );
      const signers: number[] = [];
      for (const ps of sigs) {
        const i = this.idx(s, ps.signer);
        ensure(i >= 0, 'E_NOT_MEMBER');
        ensure(pact.members.includes(ps.signer), 'E_NOT_MEMBER');
        ensure(!signers.includes(i), 'E_DUP_SIGNER');
        const sig = fromB64(ps.signature);
        ensure(sig.length === 64, 'E_BAD_SIG');
        ensure(verify(sig, msg, s.pk[i]!), 'E_BAD_SIG');
        signers.push(i);
      }
      // the confessor's own pact key must have authorised this very confession (E_BAD_CONFESSION_SIG precedes E_TOO_FEW)
      const csig = opts.confessionSig ? fromB64(opts.confessionSig) : new Uint8Array(0);
      ensure(csig.length === 64 && verifyConfessionSig(id, caller, pact.nonce, csig, s.pk[ci]!), 'E_BAD_CONFESSION_SIG');
      ensure(signers.length >= 2 && signers.includes(ci), 'E_TOO_FEW');
      // desk.pay_evm needs the 250 Tgas attach: with less the success path runs out of gas and reverts
      ensure(!s.payoutEvm || !!opts.payoutEvm, 'TX_FAILED');
      let slashed = 0n;
      for (const i of signers) if (i !== ci) { s.slashed[i] = true; slashed += s.bond; }
      s.refunded[ci] = true;
      s.status = 'Confessed';
      s.firstConfessor = ci;
      s.verified = signers;
      s.slashedTotal = slashed;
      s.payout = slashed;
      s.pactCap = pact.cap;
      s.pactNonce = pact.nonce;
      s.confessedDay = s.day;
      if (s.win) s.win.pending = false; // promise_yield_resume: the callback settles at once, no holdout
      s.payoutRoute = s.payoutEvm ? 'evm_pending' : 'near';
      s.routeAt = this.height + this.routeDelayBlocks;
      this.returnUnsold(s, id, logs);
      logs.push(mockEvent('lowball', 'confession', { season_id: id, confessor: caller, day: s.day, cap: pact.cap, nonce: pact.nonce, signers: signers.map((i) => s.buyers[i]!), bond_refunded_yocto: s.bond.toString() }));
      logs.push(mockEvent('lowball', 'slash', { season_id: id, confessor: caller, player: s.player, slashed: signers.filter((i) => i !== ci).map((i) => ({ buyer: s.buyers[i]!, yocto: s.bond.toString() })), total_yocto: slashed.toString(), payout_route: s.payoutEvm ? 'evm' : 'near', payout_evm: s.payoutEvm }));
    });
  }

  async closeSeason(id: number) {
    return this.tx('close_season', this.houseId, (logs) => {
      const s = this.season(id);
      ensure(s.status !== 'Closed', 'E_CLOSED');
      this.returnUnsold(s, id, logs);
      s.status = 'Closed';
    });
  }

  async getSeason(id: number): Promise<SeasonView> {
    const s = this.season(id);
    const live = this.live(s);
    return {
      season_id: id, player: s.player, buyers: s.buyers,
      bonds: s.buyers.map((buyer, i) => ({ buyer, posted: s.posted[i]!, slashed: s.slashed[i]!, refunded: s.refunded[i]! })),
      bond: s.bond.toString(), day: s.day, days: s.days, status: s.status,
      lots: s.lots.map(({ commits: _c, revealMap: _r, ...l }) => ({ ...l, committed: [...(_c?.keys() ?? [])].map((i) => s.buyers[i]!) })),
      leniency_day: s.leniencyDay, leniency_open: live,
      leniency_open_block: live ? s.win!.openBlock : null,
      leniency_deadline_block: live ? s.win!.openBlock + YIELD_BLOCKS : null,
      holdouts: s.holdouts, leniency_windows: s.windows,
      first_confessor: s.firstConfessor === null ? null : s.buyers[s.firstConfessor]!,
      verified_signers: s.verified.map((i) => s.buyers[i]!),
      slashed_total: s.slashedTotal.toString(), player_payout: s.payout.toString(),
      shortfall: s.shortfall, pact_cap: s.pactCap, pact_nonce: s.pactNonce, confessed_day: s.confessedDay,
      payout_evm: s.payoutEvm, payout_route: s.payoutRoute,
    };
  }
}
