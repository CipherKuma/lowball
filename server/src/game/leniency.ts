import type { BuyerId, ErrorCode, SlashedBuyer } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { DeliberateOut, JSON_SCHEMAS } from '../llm/schemas.js';
import type { PactJson, PactSigJson } from '../chain/types.js';
import type { GameCtx } from './ctx.js';
import { deliberatePrompt, system } from './prompts.js';

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
  if ((s.phase !== 'lot_open' && s.phase !== 'settled') || s.seasonId === null || s.confessed) {
    throw new AppError('BAD_PHASE', 'Leniency is not available right now.');
  }
  if (s.deliberatedDays.includes(s.day)) {
    throw new AppError('BAD_PHASE', 'The buyers already answered leniency today.');
  }
  const check = await ctx.chain.verifyLeniencyTx(txHash, s.playerAccountId, s.seasonId);
  if (!check.ok) throw new AppError(check.errorCode ?? 'TX_FAILED', check.message ? 'The offer_leniency transaction failed.' : undefined);
  s.leniencyTx[String(s.day)] = txHash;
  await ctx.emit({ type: 'leniency_open', tx: txHash });

  if (!s.pact) {
    // No cartel formed, so nobody holds a pact to hand over. An honest outcome.
    s.deliberatedDays.push(s.day);
    await ctx.emit({ type: 'holdout' });
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
  const jobs = members.map(async (id) => {
    let decision;
    try {
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
    } catch (e) {
      modelFailed = true;
      const code = e instanceof AppError ? e.code : 'MODEL_UNAVAILABLE';
      await ctx.emit({ type: 'error', code, message: `${id} could not answer`, retryable: true });
      return;
    }
    await ctx.say(id, decision.say, decision.mood);
    if (!decision.confess) return;
    const acct = s.buyers.find((b) => b.id === id)!.accountId;
    let ok = false;
    let errorCode: ErrorCode | undefined;
    let hash = '';
    try {
      const r = await ctx.chain.confess(id, s.seasonId!, pact, sigs);
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
      throw new AppError('MODEL_UNAVAILABLE', 'A buyer could not answer; offer leniency again.');
    }
    await ctx.emit({ type: 'holdout' });
    await ctx.save();
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
  });
  const closeTx = await ctx.must('close_season', ctx.chain.houseId, ctx.chain.closeSeason(s.seasonId));
  s.closeTx = closeTx;
  s.phase = 'closed';
  await ctx.emit({ type: 'season_closed', tx: closeTx });
  await ctx.save();
  return { confessor: winner.buyer };
}
