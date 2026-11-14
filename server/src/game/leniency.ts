import type { BuyerId, ErrorCode, SlashedBuyer } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { DeliberateOut, JSON_SCHEMAS } from '../llm/schemas.js';
import type { PactJson, PactSigJson } from '../chain/types.js';
import type { GameCtx } from './ctx.js';
import { startHoldoutWait, startPayout } from './finalize.js';
import { deliberatePrompt, system } from './prompts.js';
import { signConfession } from '../near/pact.js';
import { toB64 } from '../near/bytes.js';

/** Default wall-clock one /leniency request may spend waiting on the chain (the proxy cuts at 100 s). */
export const DEFAULT_WAIT_MS = 40_000;

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
 * Run the deliberation after the player's offer_leniency landed on-chain. Every pact member decides
 * concurrently; each member that decides to confess submits at once, so the contract settles a real race.
 */
export async function runLeniency(ctx: GameCtx, txHash: string): Promise<LeniencyOutcome> {
  const s = ctx.state;
  if ((s.phase !== 'lot_open' && s.phase !== 'settled') || s.seasonId === null || s.confessed || s.finalize) {
    throw new AppError('BAD_PHASE', 'Leniency is not available right now.');
  }
  if (s.deliberatedDays.includes(s.day)) {
    throw new AppError('BAD_PHASE', 'The buyers already answered leniency today.');
  }
  const check = await ctx.chain.verifyLeniencyTx(txHash, s.playerAccountId, s.seasonId);
  if (!check.ok) throw new AppError(check.errorCode ?? 'TX_FAILED', check.message ? 'The offer_leniency transaction failed.' : undefined);
  s.leniencyTx[String(s.day)] = txHash;
  const deadlineBlock = check.deadlineBlock ?? (await ctx.chain.blockHeight()) + 200;
  await ctx.emit({ type: 'leniency_open', tx: txHash, deadlineBlock });

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
  const tee = ctx.deps.tee;
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
      modelFailed = true;
      const code = e instanceof AppError ? e.code : tee ? 'TEE_UNAVAILABLE' : 'MODEL_UNAVAILABLE';
      await ctx.emit({ type: 'error', code, message: tee && e instanceof AppError ? e.message.slice(0, 200) : `${id} could not answer`, retryable: true });
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
