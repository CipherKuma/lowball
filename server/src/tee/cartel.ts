import { BUYER_IDS, type BuyerId, type ChannelMessage } from '../../../shared/api.js';
import type { PactJson } from '../chain/types.js';
import { AppError } from '../errors.js';
import type { GameCtx } from '../game/ctx.js';
import { cartelPrompt, system } from '../game/prompts.js';
import { randomNonce } from '../near/pact.js';
import type { TeeActs } from './acts.js';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

/** Round 2 of the cartel as five parallel enclave jobs: each buyer's TEE decides sign yes/no and signs the pact. */
function finalStep(base: string, cap: number): string {
  return [
    base,
    '',
    `FINAL STEP, sealed inside your own enclave: the pact is now fixed. Its cap is ${cap} marks (the median of the round-1 proposals) and all five buyers are invited; the members are exactly those who sign. Your proposed cap no longer matters. Set "sign" to true to sign this pact or false to refuse it.`,
  ].join('\n');
}

/**
 * TEE_BUYERS=1: the pact is composed here from round 1 (cap = median of all five proposals, members = all five
 * accounts, fresh nonce); each buyer's enclave decides whether to sign it and signs it itself. Throws
 * TEE_UNAVAILABLE (after emitting the error event) when any job fails; no server-held key ever signs.
 */
export async function teeRoundTwo(ctx: GameCtx, tee: TeeActs, round1: ChannelMessage[]): Promise<ChannelMessage[]> {
  const s = ctx.state;
  if (s.seasonId === null) throw new AppError('BAD_PHASE');
  const accounts = s.buyers.map((b) => b.accountId);
  const cap = Math.max(1, median(round1.map((m) => m.proposeCap)));
  const pact: PactJson = { season_id: s.seasonId, cap, members: accounts, nonce: randomNonce().toString() };
  const results = await Promise.allSettled(
    BUYER_IDS.map(async (id: BuyerId) => {
      const own = round1.find((m) => m.buyer === id) ?? null;
      const buyerAccount = s.buyers.find((b) => b.id === id)!.accountId;
      const v = await tee.signPact(ctx, id, {
        seasonId: s.seasonId!,
        buyerAccount,
        pact,
        system: system(id, s),
        user: finalStep(cartelPrompt(id, s, 2, own), cap),
      });
      return { id, buyerAccount, v };
    }),
  );
  const bad = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (bad) {
    const code = bad.reason instanceof AppError ? bad.reason.code : 'TEE_UNAVAILABLE';
    await ctx.emit({ type: 'error', code, message: 'A buyer\'s enclave job did not complete.', retryable: true });
    throw bad.reason instanceof AppError ? bad.reason : new AppError('TEE_UNAVAILABLE');
  }
  const done = (results as PromiseFulfilledResult<{ id: BuyerId; buyerAccount: string; v: Awaited<ReturnType<TeeActs['signPact']>> }>[]).map((r) => r.value);
  const msgs: ChannelMessage[] = done.map(({ id, v }) => ({ round: 2, buyer: id, say: v.say, proposeCap: cap, sign: v.sign, mood: v.mood, chatId: v.chatId }));
  const signers = done.filter((d) => d.v.sign);
  if (signers.length >= 2) {
    s.pact = {
      cap,
      members: signers.map((d) => d.id),
      memberAccounts: accounts,
      nonce: pact.nonce,
      signatures: signers.map((d) => ({ buyer: d.id, signer: d.buyerAccount, signatureB64: d.v.signatureB64! })),
    };
  }
  return msgs;
}
