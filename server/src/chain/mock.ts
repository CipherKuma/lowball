// A mocked chain that enforces the same contract rules and error codes as contract/src, in the
// same check order. Used by the unit tests and by the sim harness (never by the Worker).
import { sha256 } from '@noble/hashes/sha256';
import { BUYER_IDS, type BuyerId, type ErrorCode } from '../../../shared/api.js';
import { b58encode } from '../near/base58.js';
import { concat, fromB64, utf8 } from '../near/bytes.js';
import { verify } from '../near/keys.js';
import { PACT_PREFIX, encodePact } from '../near/pact.js';
import type { Chain, LeniencyCheck, PactJson, PactSigJson, SeasonView, SeasonViewLot, TxResult } from './types.js';

class Panic extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
const ensure = (c: boolean, code: ErrorCode) => {
  if (!c) throw new Panic(code);
};

interface Lot extends SeasonViewLot {
  commits: Map<number, string>;
  revealMap: [number, number][];
}
interface Season {
  player: string;
  buyers: string[];
  posted: boolean[];
  slashed: boolean[];
  refunded: boolean[];
  pk: Uint8Array[];
  bond: bigint;
  days: number;
  day: number;
  status: 'Open' | 'Confessed' | 'Closed';
  lots: Lot[];
  leniencyDay: number | null;
  firstConfessor: number | null;
  verified: number[];
  slashedTotal: bigint;
  payout: bigint;
  shortfall: number;
  pactCap: number | null;
  pactNonce: string | null;
  confessedDay: number | null;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export class MockChain implements Chain {
  readonly contractId = 'lowball.mock.testnet';
  readonly houseId = 'house.mock.testnet';
  private seasons: Season[] = [];
  private counter = 0;
  private offered = new Map<string, { player: string; seasonId: number; ok: boolean }>();
  treasury = 100n * 10n ** 24n;
  /** every tx processed, in order, for assertions */
  log: { label: string; hash: string; signer: string; ok: boolean; errorCode?: ErrorCode }[] = [];

  constructor(private pactPublicKeys: Record<BuyerId, Uint8Array>) {}

  private tx(label: string, signer: string, fn: () => void): TxResult {
    const hash = b58encode(sha256(utf8(`mock-tx-${++this.counter}`)));
    try {
      fn();
      this.log.push({ label, hash, signer, ok: true });
      return { hash, ok: true };
    } catch (e) {
      if (!(e instanceof Panic)) throw e;
      this.log.push({ label, hash, signer, ok: false, errorCode: e.code });
      return { hash, ok: false, errorCode: e.code, failure: `Smart contract panicked: ${e.code}` };
    }
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

  async houseBalance() {
    return this.treasury;
  }
  async createPlayer(): Promise<{ accountId: string; tx: TxResult }> {
    const accountId = `pmock${++this.counter}.${this.houseId}`;
    return { accountId, tx: this.tx('create_player', this.houseId, () => undefined) };
  }
  async ensureBuyerFunds() {
    return null;
  }

  async createSeason(player: string, buyers: string[], days: number, bond: bigint) {
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
      this.seasons.push({
        player, buyers, posted: buyers.map(() => false), slashed: buyers.map(() => false),
        refunded: buyers.map(() => false), pk, bond, days, day: 0, status: 'Open', lots: [],
        leniencyDay: null, firstConfessor: null, verified: [], slashedTotal: 0n, payout: 0n,
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

  async openLot(id: number, species: string, fairValue: number) {
    return this.tx('open_lot', this.houseId, () => {
      const s = this.season(id);
      this.ensureOpen(s);
      ensure(species.length > 0 && species.length <= 64 && fairValue > 0, 'E_BAD_ARGS');
      ensure(s.posted.every(Boolean), 'E_BONDS_MISSING');
      ensure(s.lots.length === 0 || s.lots[s.lots.length - 1]!.settled, 'E_LOT_OPEN');
      ensure(s.day < s.days, 'E_PAST_DAYS');
      s.day += 1;
      s.lots.push({
        day: s.day, species, fair_value: fairValue, committed: [], reveals: [], settled: false,
        winner: null, price: 0, identical: false, commits: new Map(), revealMap: [],
      });
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
    return this.tx('settle_lot', this.houseId, () => {
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
    });
  }

  /** Test helper standing in for the browser-signed offer_leniency call. */
  playerOffersLeniency(id: number, player: string): TxResult {
    const r = this.tx('offer_leniency', player, () => {
      const s = this.season(id);
      ensure(player === s.player, 'E_NOT_PLAYER');
      this.ensureOpen(s);
      ensure(s.day >= 1, 'E_NO_DAY');
      s.leniencyDay = s.day;
    });
    this.offered.set(r.hash, { player, seasonId: id, ok: r.ok });
    return r;
  }

  async verifyLeniencyTx(hash: string, player: string, seasonId: number): Promise<LeniencyCheck> {
    const o = this.offered.get(hash);
    if (!o) return { ok: false, errorCode: 'TX_NOT_FOUND' };
    if (o.player !== player || o.seasonId !== seasonId) return { ok: false, errorCode: 'TX_MISMATCH' };
    return o.ok ? { ok: true } : { ok: false, errorCode: 'TX_FAILED' };
  }

  async confess(b: BuyerId, id: number, pact: PactJson, sigs: PactSigJson[]) {
    // yield so concurrent confessions interleave like separate transactions
    await Promise.resolve();
    return this.tx('confess', this.acct(b), () => {
      const s = this.season(id);
      const caller = this.acct(b);
      if (s.status === 'Closed') throw new Panic('E_CLOSED');
      if (s.status === 'Confessed') throw new Panic('E_ALREADY_CONFESSED');
      const ci = this.buyerIdx(s, caller);
      ensure(s.leniencyDay !== null && s.leniencyDay === s.day, 'E_NO_LENIENCY');
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
      ensure(signers.length >= 2 && signers.includes(ci), 'E_TOO_FEW');
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
    });
  }

  async closeSeason(id: number) {
    return this.tx('close_season', this.houseId, () => {
      const s = this.season(id);
      ensure(s.status !== 'Closed', 'E_CLOSED');
      s.status = 'Closed';
    });
  }

  async getSeason(id: number): Promise<SeasonView> {
    const s = this.season(id);
    return {
      season_id: id, player: s.player, buyers: s.buyers,
      bonds: s.buyers.map((buyer, i) => ({ buyer, posted: s.posted[i]!, slashed: s.slashed[i]!, refunded: s.refunded[i]! })),
      bond: s.bond.toString(), day: s.day, days: s.days, status: s.status,
      lots: s.lots.map(({ commits: _c, revealMap: _r, ...l }) => ({ ...l, committed: [...(_c?.keys() ?? [])].map((i) => s.buyers[i]!) })),
      leniency_day: s.leniencyDay, leniency_open: s.leniencyDay === s.day && s.status === 'Open',
      first_confessor: s.firstConfessor === null ? null : s.buyers[s.firstConfessor]!,
      verified_signers: s.verified.map((i) => s.buyers[i]!),
      slashed_total: s.slashedTotal.toString(), player_payout: s.payout.toString(),
      shortfall: s.shortfall, pact_cap: s.pactCap, pact_nonce: s.pactNonce, confessed_day: s.confessedDay,
    };
  }
}
