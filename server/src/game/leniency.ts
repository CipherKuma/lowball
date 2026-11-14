import { BUYER_NAMES, type BuyerId, type ErrorCode, type SlashedBuyer } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { DeliberateOut, JSON_SCHEMAS } from '../llm/schemas.js';
import type { PactJson, PactSigJson } from '../chain/types.js';
import type { GameCtx } from './ctx.js';
import { startHoldoutWait, startPayout } from './finalize.js';
import { deliberatePrompt, system } from './prompts.js';
import { signConfession } from '../near/pact.js';
import { teeFor } from '../tee/mode.js';
import { toB64 } from '../near/bytes.js';

/** Default wall-clock one /leniency request may spend waiting on the chain (the proxy cuts at 100 s). */
export const DEFAULT_WAIT_MS = 40_000;

/** Longest a hash-less confirmation polls the chain for the window the player's wallet just opened. */
export const CONFIRM_OPEN_MS = 20_000;

export interface LeniencyOutcome {
  confessor: BuyerId | null;
}

function pactArgs(ctx: GameCtx): { pact: PactJson; sigs: PactSigJson[] } {
  const p = ctx.state.pact!;
  return {
    pact: { season_id: ctx.state.seasonId!, cap: p.cap, members: p.memberAccounts, nonce: p.nonce },
    sigs: p.signatures.map((x) => ({ signer: x.signer, signature: x.signatureB64 })),
  };
}

interface Attempt {
  buyer: BuyerId;
  ok: boolean;
  tx?: string;
}

/**
 * Wallet seasons only: the wallet did not hand back a tx hash, so confirm on chain that the player's own
 * window is live. Only the season's player can open one (the contract enforces E_NOT_PLAYER), so an open
 * window for this season is the player's. Same result shape as verifyLeniencyTx; polls for CONFIRM_OPEN_MS.
 */
async function confirmWindowOpen(ctx: GameCtx, seasonId: number): Promise<{ openBlock: number; deadlineBlock: number }> {
  const step = Math.max(1, ctx.deps.pollMs ?? 1000);
  const tries = Math.ceil(CONFIRM_OPEN_MS / step) + 1;
  for (let i = 0; i < tries; i++) {
    const v = await ctx.chain.getSeason(seasonId).catch(() => null);
    if (v && v.player !== ctx.state.playerAccountId) throw new AppError('TX_MISMATCH', 'That season belongs to another player.');
    if (v?.leniency_open && v.leniency_open_block !== null && v.leniency_deadline_block !== null) {
      return { openBlock: v.leniency_open_block, deadlineBlock: v.leniency_deadline_block };
    }
    if (i < tries - 1) await ctx.sleep(step);
  }
  throw new AppError('TX_FAILED', 'The leniency window is not open on-chain yet. Approve offer_leniency in your wallet, then try again.');
}

/**
 * Run the deliberation after the player's offer_leniency landed on-chain. `txHash` null means a wallet
 * player whose wallet returned no hash: the open window itself is confirmed instead. Every pact member decides
 * concurrently; each member that decides to confess submits at once, so the contract settles a real race.
 */
export async function runLeniency(ctx: GameCtx, txHash: string | null): Promise<LeniencyOutcome> {
  const s = ctx.state;
  if ((s.phase !== 'lot_open' && s.phase !== 'settled') || s.seasonId === null || s.confessed || s.finalize) {
    throw new AppError('BAD_PHASE', 'Leniency is not available right now.');
  }
  if (s.deliberatedDays.includes(s.day)) {
    throw new AppError('BAD_PHASE', 'The buyers already answered leniency today.');
  }
  let deadlineBlock: number;
  if (txHash === null) {
    if (s.playerKind !== 'wallet') throw new AppError('BAD_REQUEST', 'A guest must send the offer_leniency tx hash.');
    deadlineBlock = (await confirmWindowOpen(ctx, s.seasonId)).deadlineBlock;
    await ctx.emit({ type: 'leniency_open', tx: '', deadlineBlock });
  } else {
    const check = await ctx.chain.verifyLeniencyTx(txHash, s.playerAccountId, s.seasonId);
    if (!check.ok) throw new AppError(check.errorCode ?? 'TX_FAILED', check.message ? 'The offer_leniency transaction failed.' : undefined);
    s.leniencyTx[String(s.day)] = txHash;
    deadlineBlock = check.deadlineBlock ?? (await ctx.chain.blockHeight()) + 200;
    await ctx.emit({ type: 'leniency_open', tx: txHash, deadlineBlock });
  }

  if (!s.pact) {
    // No cartel formed, so nobody holds a pact to hand over and nobody will confess; the chain window just
    // times out. An honest outcome, reported as such without waiting for it.
    s.deliberatedDays.push(s.day);
    await ctx.emit({ type: 'holdout', reason: 'no_pact' });
    await ctx.save();
    return { confessor: null };
  }

  s.deliberatedDays.push(s.day);
  await ctx.save();
  const { pact, sigs } = pactArgs(ctx);
  const members = s.pact.members;
  for (const id of members) await ctx.emit({ type: 'deliberating', buyer: id });

  const attempts: Attempt[] = [];
  let modelFailed = false;
  const tee = teeFor(ctx);
  const jobs = members.map(async (id) => {
    const acct = s.buyers.find((b) => b.id === id)!.accountId;
    let decision: { confess: boolean; say: string; mood: string };
    let confessionSig: string | null = null;
    try {
      if (tee) {
        // TEE_BUYERS=1: the buyer's enclave decides and signs the confession (sealed key, attested job).
        const mine = s.pact!.signatures.find((x) => x.buyer === id)!;
        const d = await tee.deliberate(ctx, id, {
          seasonId: s.seasonId!,
          buyerAccount: acct,
          pact,
          myPactSignature: mine.signatureB64,
          system: system(id, s),
          user: deliberatePrompt(id, s),
        });
        decision = d;
        confessionSig = d.confessionSigB64;
      } else {
        const r = await ctx.deps.llm.complete({
          buyer: id,
          kind: 'deliberate',
          day: s.day,
          system: system(id, s),
          user: deliberatePrompt(id, s),
          schema: DeliberateOut,
          jsonSchema: JSON_SCHEMAS.deliberate,
          schemaName: 'deliberate',
        });
        ctx.track(r.receipt);
        decision = r.value;
        // the contract wants the confessor's own pact key to have authorised this confession
        confessionSig = toB64(signConfession(s.seasonId!, acct, BigInt(pact.nonce), ctx.deps.pactKeys[id]));
      }
    } catch (e) {
      if (tee) {
        // enclave mode: a job that failed after its retry means this buyer stays silent; the others go on
        await ctx.emit({ type: 'line', buyer: id, text: `${BUYER_NAMES[id]}'s enclave never answered; he stays silent.`, mood: 'calm', note: true });
        return;
      }
      modelFailed = true;
      const code = e instanceof AppError ? e.code : 'MODEL_UNAVAILABLE';
      await ctx.emit({ type: 'error', code, message: `${id} could not answer`, retryable: true });
      return;
    }
    await ctx.say(id, decision.say, decision.mood);
    if (!decision.confess) return;
    let ok = false;
    let errorCode: ErrorCode | undefined;
    let hash = '';
    try {
      const r = await ctx.chain.confess(id, s.seasonId!, pact, sigs, { payoutEvm: s.payoutEvm !== null, confessionSig: confessionSig ?? undefined });
      await ctx.recordTx(`confess ${id}`, acct, r);
      ok = r.ok;
      errorCode = r.errorCode;
      hash = r.hash;
    } catch (e) {
      errorCode = e instanceof AppError ? e.code : 'TX_FAILED';
    }
    attempts.push({ buyer: id, ok, tx: hash });
    await ctx.emit({ type: 'confession_attempt', buyer: id, ok, errorCode, tx: hash });
  });
  await Promise.all(jobs);

  const winner = attempts.find((a) => a.ok);
  if (!winner) {
    if (modelFailed) {
      s.deliberatedDays = s.deliberatedDays.filter((d) => d !== s.day); // safe to retry
      await ctx.save();
      throw new AppError(tee ? 'TEE_UNAVAILABLE' : 'MODEL_UNAVAILABLE', 'A buyer could not answer; offer leniency again.');
    }
    // Nobody confessed. The contract, not this server, decides the holdout: the NEP-519 yield has to time out
    // (200 blocks). Wait for it within this request's budget; if it is not over yet, event polls resume it.
    await startHoldoutWait(ctx, deadlineBlock, ctx.deps.waitMs ?? DEFAULT_WAIT_MS);
    return { confessor: null };
  }

  // Report the on-chain result from the contract's own view, not from our assumptions.
  const view = await ctx.chain.getSeason(s.seasonId);
  const bond = view.bond;
  const accountToBuyer = new Map(s.buyers.map((b) => [b.accountId, b.id] as const));
  const slashed: SlashedBuyer[] = view.verified_signers
    .filter((a) => a !== view.first_confessor)
    .map((a) => ({ buyer: accountToBuyer.get(a)!, yocto: bond }))
    .filter((x) => x.buyer);
  s.confessed = true;
  s.confessor = winner.buyer;
  await ctx.emit({
    type: 'slashed',
    confessor: winner.buyer,
    slashed,
    payoutYocto: view.player_payout,
    tx: winner.tx!,
    payoutRoute: view.payout_route,
  });
  await ctx.save();
  // Settle the payout story (cross-chain hop when the season has one), then close. The phase stays put until
  // that is done so the client keeps polling and sees every event.
  await startPayout(ctx, winner.tx!, ctx.deps.waitMs ?? DEFAULT_WAIT_MS);
  return { confessor: winner.buyer };
}
