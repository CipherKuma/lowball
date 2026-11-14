// Work that waits on the chain after the buyers answered leniency: the contract's 200-block window
// (decides holdout) and the cross-chain payout. Resumable: state.finalize says what is pending, the
// session phase stays put until it ends, and event polls keep resuming it (the Worker has no alarms).
import { ChainsigError } from '../chainsig/types.js';
import { AppError } from '../errors.js';
import { debug } from '../log.js';
import type { GameCtx } from './ctx.js';
import type { Finalize } from './state.js';

/** Give up on a cross-chain payout that has not landed after this long; the desk record stays for a retry. */
const PAYOUT_GIVE_UP_MS = 4 * 60_000;

const nowOf = (ctx: GameCtx) => (ctx.deps.now ?? Date.now)();

/** Close the season after a confession (once the payout story is told) and end the game. */
async function closeAfterConfession(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  const closeTx = await ctx.must('close_season', ctx.chain.houseId, ctx.chain.closeSeason(s.seasonId!));
  s.closeTx = closeTx;
  s.phase = 'closed';
  s.finalize = null;
  await ctx.emit({ type: 'season_closed', tx: closeTx });
  await ctx.save();
}

/** true when resolved (nothing left pending) */
async function resolveHoldout(ctx: GameCtx, f: Extract<Finalize, { kind: 'holdout' }>, until: number): Promise<boolean> {
  const s = ctx.state;
  for (;;) {
    f.checkedAt = nowOf(ctx);
    const [view, height] = await Promise.all([ctx.chain.getSeason(s.seasonId!), ctx.chain.blockHeight()]);
    if (view.status === 'Confessed') {
      // cannot happen (only this server's buyers confess); never announce a holdout over a confession
      throw new AppError('INTERNAL', 'season confessed while a holdout was pending');
    }
    // The contract decides: the window is closed on-chain (yield timed out) or its deadline block has passed.
    if (!view.leniency_open || height > f.deadlineBlock) {
      s.finalize = null;
      await ctx.emit({ type: 'holdout', reason: 'timeout' });
      await ctx.save();
      return true;
    }
    if (nowOf(ctx) >= until) {
      await ctx.save();
      return false;
    }
    await ctx.sleep(ctx.deps.pollMs ?? 3000);
  }
}

async function failPayout(ctx: GameCtx, message: string, retryable: boolean): Promise<void> {
  await ctx.emit({ type: 'error', code: 'PAYOUT_EVM_FAILED', message, retryable });
}

async function resolvePayout(ctx: GameCtx, f: Extract<Finalize, { kind: 'payout' }>, until: number): Promise<boolean> {
  const s = ctx.state;
  const { payout } = ctx.deps;
  for (;;) {
    f.checkedAt = nowOf(ctx);
    const view = await ctx.chain.getSeason(s.seasonId!);
    if (view.payout_route === 'evm_pending') {
      if (nowOf(ctx) >= until) {
        await ctx.save();
        return false;
      }
      await ctx.sleep(ctx.deps.pollMs ?? 3000);
      continue;
    }
    if (view.payout_route === 'evm_failed_near') {
      // The desk call failed and the contract paid the slashed sum to the player in NEAR instead: say so.
      await failPayout(ctx, 'The cross-chain desk failed, so the slashed bonds were paid to you in NEAR instead.', false);
      await closeAfterConfession(ctx);
      return true;
    }
    if (view.payout_route !== 'evm') {
      await closeAfterConfession(ctx);
      return true;
    }
    if (!payout) {
      await failPayout(ctx, 'The payout relayer is not configured. The NEAR sits at the payout desk; the Sepolia transfer is not made.', true);
      await closeAfterConfession(ctx);
      return true;
    }
    const left = Math.max(2000, until - nowOf(ctx));
    try {
      const r = await payout.relay(s.seasonId!, { waitSignedMs: Math.min(left, 25_000), waitReceiptMs: Math.min(left, 20_000) });
      await ctx.emit({ type: 'payout_evm', to: r.to, amountWei: r.amountWei, sepoliaTx: r.sepoliaTx, nearTx: f.confessTx, status: r.status });
      if (r.status === 'reverted') await failPayout(ctx, 'The Sepolia payout transaction reverted.', true);
      await closeAfterConfession(ctx);
      return true;
    } catch (e) {
      const code = e instanceof ChainsigError ? e.code : 'UNKNOWN';
      debug('finalize', 'payout relay', code, String(e).slice(0, 200));
      const waiting = code === 'PAYOUT_PENDING' || code === 'EVM_UNAVAILABLE' || code === 'NEAR_VIEW_FAILED' || code === 'UNKNOWN';
      if (waiting && nowOf(ctx) - f.startedAt < PAYOUT_GIVE_UP_MS) {
        await ctx.save();
        return false;
      }
      const msg =
        code === 'UNDERFUNDED'
          ? 'The payout desk address has no Sepolia ETH left, so the cross-chain payout could not be sent.'
          : 'The cross-chain payout did not complete. The NEAR sits at the payout desk and can be relayed again.';
      await failPayout(ctx, msg, true);
      await closeAfterConfession(ctx);
      return true;
    }
  }
}

/** Advance whatever is pending until it resolves or `budgetMs` of wall-clock is spent. */
export async function resolveFinalize(ctx: GameCtx, budgetMs: number): Promise<boolean> {
  const f = ctx.state.finalize;
  if (!f) return true;
  const until = nowOf(ctx) + budgetMs;
  return f.kind === 'holdout' ? resolveHoldout(ctx, f, until) : resolvePayout(ctx, f, until);
}

export async function startPayout(ctx: GameCtx, confessTx: string, budgetMs: number): Promise<boolean> {
  const now = nowOf(ctx);
  ctx.state.finalize = { kind: 'payout', confessTx, startedAt: now, checkedAt: now };
  await ctx.save();
  return resolveFinalize(ctx, budgetMs);
}

export async function startHoldoutWait(ctx: GameCtx, deadlineBlock: number, budgetMs: number): Promise<boolean> {
  ctx.state.finalize = { kind: 'holdout', day: ctx.state.day, deadlineBlock, checkedAt: nowOf(ctx) };
  await ctx.save();
  return resolveFinalize(ctx, budgetMs);
}
