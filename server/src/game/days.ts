import { sha256 } from '@noble/hashes/sha256';
import { BUYER_IDS, type BuyerId } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { debug } from '../log.js';
import { BidOut, JSON_SCHEMAS, ReactOut } from '../llm/schemas.js';
import { concat, fromHex, toHex } from '../near/bytes.js';
import { mintsOf, transfersOf } from '../near/events.js';
import { newSalt } from '../near/signer.js';
import type { GameCtx } from './ctx.js';
import { emitRecap } from '../features/recap.js';
import { seaMultiplier } from '../features/sea.js';
import { lotFor } from './lots.js';
import { bidPrompt, reactPrompt, system } from './prompts.js';
import type { BidDecision } from './state.js';

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

/** commitment = sha256(amount_le_u32 || salt32), matching the contract. */
export function commitmentHash(amount: number, salt: Uint8Array): Uint8Array {
  return sha256(concat(u32le(amount), salt));
}

async function failIf<T>(_ctx: GameCtx, results: PromiseSettledResult<T>[], _what: string): Promise<void> {
  const bad = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (!bad) return;
  throw bad.reason instanceof AppError ? bad.reason : new AppError('INTERNAL');
}

/** Open the next lot on-chain (or the first). Used by begin and next_day. */
export async function openNextLot(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  if (s.seasonId === null) throw new AppError('BAD_PHASE');
  const day = s.day + 1;
  const lot = lotFor(s.seed, day, seaMultiplier(s));
  const opened = await ctx.mustTx(`open_lot day ${day}`, ctx.chain.houseId, ctx.chain.openLot(s.seasonId, lot.species, lot.fairValue, lot.weightKg));
  const tx = opened.hash;
  s.day = day;
  s.lots.push({ day, species: lot.species, weightKg: lot.weightKg, fairValue: lot.fairValue, reveals: [], identical: false, winner: null, price: 0, shortfall: 0, settled: false });
  s.phase = 'lot_open';
  s.auction = null;
  await ctx.emit({ type: 'day_opened', day, species: lot.species, weightKg: lot.weightKg, fairValue: lot.fairValue, tx, ...(lot.market ? { market: lot.market } : {}), ...(lot.marketFallback ? { marketFallback: true as const } : {}) });
  // The catch is a NEP-245 token minted into escrow by open_lot: report what the receipt says, never a guess.
  const mint = mintsOf(opened.logs)[0];
  if (mint) await ctx.emit({ type: 'lot_minted', tokenId: mint.tokenId, amount: mint.amount, tx });
  else debug('days', 'open_lot receipt carried no mt_mint event');
  await ctx.save();
}

export async function nextDay(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  if (s.phase !== 'settled' || s.seasonId === null) throw new AppError('BAD_PHASE', 'Settle today\'s lot first.');
  if (s.day >= s.days) {
    const tx = await ctx.must('close_season', ctx.chain.houseId, ctx.chain.closeSeason(s.seasonId));
    s.phase = 'closed';
    s.closeTx = tx;
    await ctx.emit({ type: 'season_closed', tx });
    await ctx.save();
    return;
  }
  await openNextLot(ctx);
}

const MAX_HOLDS_PER_DAY = 2;
const ALREADY = new Set(['E_ALREADY_COMMITTED', 'E_ALREADY_REVEALED']);

/** One buyer's tx where a repeat of an already-landed step counts as done. */
async function idempotent(ctx: GameCtx, label: string, signer: string, p: Promise<import('../chain/types.js').TxResult>): Promise<string> {
  const r = await p;
  await ctx.recordTx(label, signer, r);
  if (r.ok) return r.hash;
  if (r.errorCode && ALREADY.has(r.errorCode)) return r.hash;
  throw new AppError(r.errorCode ?? 'TX_FAILED');
}

/** sell: buyers decide (LLM), commit, reveal, settle. Resumable: every sub-step is persisted. */
export async function sell(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  if (s.phase !== 'lot_open' || s.seasonId === null) throw new AppError('BAD_PHASE', 'There is no open lot to sell.');
  const seasonId = s.seasonId;
  const lot = s.lots[s.lots.length - 1]!;
  if (!s.auction || s.auction.day !== s.day) s.auction = { day: s.day, decisions: {} };
  const auction = s.auction;

  // 1. decisions (all five concurrently, each sees only public state and its own memory)
  const undecided = BUYER_IDS.filter((id) => !auction.decisions[id]);
  const decided = await Promise.allSettled(
    undecided.map(async (id) => {
      const r = await ctx.deps.llm.complete({
        buyer: id,
        kind: 'bid',
        day: s.day,
        system: system(id, s),
        user: bidPrompt(id, s, lot),
        schema: BidOut,
        jsonSchema: JSON_SCHEMAS.bid,
        schemaName: 'bid',
      });
      ctx.track(r.receipt);
      const d: BidDecision = {
        amount: Math.min(r.value.amount, lot.fairValue * 3),
        say: r.value.say,
        mood: r.value.mood,
        saltHex: toHex(newSalt()),
      };
      auction.decisions[id] = d;
    }),
  );
  await ctx.save();
  await failIf(ctx, decided, 'A buyer could not decide');

  // 2. commit (each buyer signs its own tx; five run in parallel)
  const commits = await Promise.allSettled(
    BUYER_IDS.filter((id) => !auction.decisions[id]!.commitTx).map(async (id) => {
      const d = auction.decisions[id]!;
      const acct = s.buyers.find((b) => b.id === id)!.accountId;
      const hash = commitmentHash(d.amount, fromHex(d.saltHex));
      d.commitTx = await idempotent(ctx, `commit_bid ${id} d${s.day}`, acct, ctx.chain.commitBid(id, seasonId, hash));
      await ctx.emit({ type: 'bid_committed', buyer: id, tx: d.commitTx });
    }),
  );
  await ctx.save();
  await failIf(ctx, commits, 'A commit failed');

  // 3. reveal
  const pendingReveal = BUYER_IDS.filter((id) => !auction.decisions[id]!.revealTx);
  const reveals = await Promise.allSettled(
    pendingReveal.map(async (id) => {
      const d = auction.decisions[id]!;
      const acct = s.buyers.find((b) => b.id === id)!.accountId;
      d.revealTx = await idempotent(ctx, `reveal_bid ${id} d${s.day}`, acct, ctx.chain.revealBid(id, seasonId, d.amount, fromHex(d.saltHex)));
    }),
  );
  await ctx.save();
  await failIf(ctx, reveals, 'A reveal failed');
  const revealList = BUYER_IDS.map((id) => ({ buyer: id as BuyerId, amount: auction.decisions[id]!.amount, tx: auction.decisions[id]!.revealTx! }));
  const identical = revealList.every((r) => r.amount === revealList[0]!.amount);

  // 4. settle
  if (!auction.settleTx) {
    const settled = await ctx.mustTx(`settle_lot d${s.day}`, ctx.chain.houseId, ctx.chain.settleLot(seasonId));
    auction.settleTx = settled.hash;
    const t = transfersOf(settled.logs)[0];
    if (t) auction.transfer = { tokenId: t.tokenId, to: t.to, memo: t.memo };
    await ctx.save();
  }
  const view = await ctx.chain.getSeason(seasonId);
  const lv = view.lots.find((l) => l.day === s.day);
  if (!lv || !lv.settled) throw new AppError('TX_FAILED', 'lot not settled on-chain');
  const winner = BUYER_IDS.find((id) => s.buyers.find((b) => b.id === id)!.accountId === lv.winner) ?? null;
  const shortfall = Math.max(0, lot.fairValue - lv.price);

  await ctx.emit({ type: 'bids_revealed', reveals: revealList, identical });
  for (const id of BUYER_IDS) await ctx.say(id, auction.decisions[id]!.say, auction.decisions[id]!.mood);
  await ctx.emit({ type: 'lot_settled', winner, price: lv.price, shortfall, tx: auction.settleTx });
  if (auction.transfer) {
    const to = auction.transfer.to;
    const buyer = BUYER_IDS.find((id) => s.buyers.find((b) => b.id === id)!.accountId === to) ?? null;
    await ctx.emit({ type: 'lot_transferred', tokenId: auction.transfer.tokenId, to, buyer, memo: auction.transfer.memo, tx: auction.settleTx });
  }
  await emitRecap(ctx, { day: s.day, species: lot.species, fairValue: lot.fairValue, price: lv.price, winner, reveals: revealList });
  lot.reveals = revealList.map((r) => ({ buyer: r.buyer, amount: r.amount }));
  lot.identical = lv.identical;
  lot.winner = winner;
  lot.price = lv.price;
  lot.shortfall = shortfall;
  lot.settled = true;
  s.auction = null;
  s.phase = 'settled';
  await ctx.save();
}

/** hold: the fisher keeps the lot back; buyers react aloud. The lot stays open. */
export async function hold(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  if (s.phase !== 'lot_open') throw new AppError('BAD_PHASE', 'There is no open lot to hold.');
  if (s.holdsToday.day !== s.day) s.holdsToday = { day: s.day, n: 0 };
  if (s.holdsToday.n >= MAX_HOLDS_PER_DAY) throw new AppError('BAD_PHASE', 'The buyers will not wait any longer today.');
  s.holdsToday.n += 1;
  const out = await Promise.allSettled(
    BUYER_IDS.map(async (id) => {
      const r = await ctx.deps.llm.complete({
        buyer: id,
        kind: 'react',
        day: s.day,
        system: system(id, s),
        user: reactPrompt(id, s),
        schema: ReactOut,
        jsonSchema: JSON_SCHEMAS.react,
        schemaName: 'react',
      });
      ctx.track(r.receipt);
      return { id, ...r.value };
    }),
  );
  s.holds += 1;
  for (const r of out) if (r.status === 'fulfilled') await ctx.say(r.value.id, r.value.say, r.value.mood);
  await ctx.save();
  await failIf(ctx, out, 'A buyer could not react');
}
