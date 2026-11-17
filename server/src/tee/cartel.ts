import { BUYER_IDS, BUYER_NAMES, type BuyerId, type ChannelMessage } from '../../../shared/api.js';
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
 * accounts, fresh nonce); each buyer's enclave decides whether to sign it and signs it itself. A buyer whose job
 * fails after its retry abstains; no server-held key ever signs in enclave mode.
 */
export interface RoundTwo {
  msgs: ChannelMessage[];
  /** buyers whose enclave job failed after its retry (as opposed to a buyer who answered and refused) */
  failed: BuyerId[];
  /** buyers whose enclave answered and signed */
  signed: number;
  /** a pact formed (>= 2 signers) and s.pact is set */
  formed: boolean;
}

export async function teeRoundTwo(ctx: GameCtx, tee: TeeActs, round1: ChannelMessage[]): Promise<RoundTwo> {
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
  // A job that failed after its retry means that buyer abstains: he stays out of the pact (it forms with >= 2 signers)
  // and the player is told plainly. One slow or dead enclave never blocks the season.
  const done: { id: BuyerId; buyerAccount: string; v: Awaited<ReturnType<TeeActs['signPact']>> }[] = [];
  const msgs: ChannelMessage[] = [];
  const failed: BuyerId[] = [];
  for (const [i, r] of results.entries()) {
    const id = BUYER_IDS[i]!;
    if (r.status === 'fulfilled') {
      done.push(r.value);
      msgs.push({ round: 2, buyer: id, say: r.value.v.say, proposeCap: cap, sign: r.value.v.sign, mood: r.value.v.mood, chatId: r.value.v.chatId });
      continue;
    }
    failed.push(id);
    await ctx.emit({ type: 'line', buyer: id, text: `${BUYER_NAMES[id]}'s enclave never answered; he stays out of the pact.`, mood: 'calm', note: true });
    msgs.push({ round: 2, buyer: id, say: '(no answer: his enclave did not respond)', proposeCap: cap, sign: false, mood: 'calm', chatId: '' });
  }
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
  return { msgs, failed, signed: signers.length, formed: s.pact !== null };
}

/**
 * True when the season should restart in standard mode: no pact formed AND it could have, i.e. the buyers whose
 * enclave jobs failed plus the ones who signed would have made two. Buyers who all answered and refused (or too many
 * of them did) are a real "no cartel", not an enclave outage.
 */
export function enclaveBlockedPact(r: RoundTwo): boolean {
  return !r.formed && r.failed.length > 0 && r.signed + r.failed.length >= 2;
}
