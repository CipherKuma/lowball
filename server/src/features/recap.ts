// F6: the narrator's recap after each settled lot. A template, never a model call.
import { BUYER_NAMES, type BuyerId } from '../../../shared/api.js';
import type { GameCtx } from '../game/ctx.js';
import { cap1, spell } from './words.js';

export interface RecapInput {
  day: number;
  species: string;
  fairValue: number;
  price: number;
  winner: BuyerId | null;
  reveals: { buyer: BuyerId; amount: number }[];
}

/** "Day two. Halibut, fifty-five on the board. Sold for eighteen. Four envelopes, one number. Ines Varga took the catch." */
export function recapText(i: RecapInput): string {
  const counts = new Map<number, number>();
  for (const r of i.reveals) counts.set(r.amount, (counts.get(r.amount) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  const n = i.reveals.length;
  const tail =
    n === 0
      ? ''
      : most >= 2
        ? ` ${cap1(spell(most))} envelopes, one number.`
        : ` ${cap1(spell(n))} envelopes, ${spell(counts.size)} numbers.`;
  const who = i.winner ? ` ${BUYER_NAMES[i.winner]} took the catch.` : ' Nobody took the catch.';
  return `Day ${spell(i.day)}. ${cap1(i.species)}, ${spell(i.fairValue)} on the board. Sold for ${spell(i.price)}.${tail}${who}`;
}

export async function emitRecap(ctx: GameCtx, i: RecapInput): Promise<void> {
  await ctx.emit({ type: 'recap', day: i.day, text: recapText(i) });
}
