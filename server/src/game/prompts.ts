import { BUYER_NAMES, type BuyerId, type ChannelMessage } from '../../../shared/api.js';
import { yoctoToNear } from '../near/accounts.js';
import { PERSONAS } from './cast.js';
import type { LotMemory, SessionState } from './state.js';
import { FAIR_VALUE_RANGE } from './lots.js';

// Accounting rate told to buyers: 1 mark = 0.002 NEAR. At this rate a 0.1 NEAR bond is 50 marks, while a
// member's pooled share of a lot is ~15-30 marks: loyalty outweighs the bond early in the season and not
// late, which is the tension the game is built on (tuned after the 2026-11-14 live run, where every buyer
// defected on day 1 and nearly all confessed at the first offer).
export const MARK_NEAR = 0.002;
const marksOf = (near: string) => Math.round(Number(near) / MARK_NEAR);

export function bondNear(s: SessionState): string {
  return yoctoToNear(s.bondYocto, 3);
}

export function identicalStreak(lots: LotMemory[]): number {
  let n = 0;
  for (let i = lots.length - 1; i >= 0; i--) {
    const l = lots[i]!;
    if (!l.settled) continue;
    if (!l.identical) break;
    n++;
  }
  return n;
}

/** Leniency unlocks once the fisher has a case: this many settled lots with all bids identical. */
export const CASE_DAYS = 2;

/** A day goes on the record when at least 4 of the 5 sealed bids are the same number, below the board price. */
export function isEvidence(l: LotMemory): boolean {
  if (!l.settled) return false;
  if (l.identical) return true;
  const counts = new Map<number, number>();
  for (const r of l.reveals) counts.set(r.amount, (counts.get(r.amount) ?? 0) + 1);
  return [...counts.entries()].some(([amount, n]) => n >= 4 && amount < l.fairValue);
}

export function caseDays(lots: LotMemory[]): number {
  return lots.filter(isEvidence).length;
}

/** Members who bid above the cap on a settled lot, for the ring's memory. */
export function capBreakers(s: SessionState): string[] {
  const pact = s.pact;
  if (!pact) return [];
  const out: string[] = [];
  for (const l of s.lots.filter((x) => x.settled)) {
    for (const r of l.reveals) {
      if (pact.members.includes(r.buyer) && r.amount > pact.cap) out.push(`${BUYER_NAMES[r.buyer]} (day ${l.day}, bid ${r.amount})`);
    }
  }
  return out;
}

export function shortfallSoFar(lots: LotMemory[]): number {
  return lots.reduce((a, l) => a + (l.settled ? l.shortfall : 0), 0);
}

export function system(id: BuyerId, s: SessionState): string {
  const p = PERSONAS[id];
  const others = Object.values(BUYER_NAMES).filter((n) => n !== BUYER_NAMES[id]).join(', ');
  return [
    `You are ${BUYER_NAMES[id]}, ${p.look}. You are one of five fish buyers on a harbour: you, ${others}.`,
    `${p.play} Voice: ${p.voice}`,
    '',
    'THE GAME (the stakes are real: bonds are NEAR testnet tokens held by a smart contract).',
    `- A ${s.days}-day season. Each day the fisher Marguerite lands one lot. All five buyers privately commit a sealed bid in marks (integers), then reveal. The highest bid wins and pays its own bid. Ties go to the earliest reveal.`,
    `- A lot's fair value is what the fish is really worth to you. Winning at price p earns you (fair value - p) marks; losing earns nothing. 1 mark is worth ${MARK_NEAR} NEAR. The fisher loses (fair value - price) every day the winning price is low.`,
    `- Each buyer posted a bond of ${bondNear(s)} NEAR. Bonds are refunded at season end unless slashed.`,
    '- Before the season buyers may talk privately and agree a cartel: a pact that caps every member\'s bid. A pact is signed by each member with their own key. Signing is voluntary.',
    "- THE RING'S RULES (how rings on this pier have always worked): every member bids exactly the cap, so the bids look identical; whoever wins a lot pays into a pool, and at season end the pool is split equally among loyal members. A member who bids above the cap is seen at the reveal, thrown out of the pool and never traded with again on this pier. Once you have signed, your profit comes from the pool, not from outbidding anyone.",
    `- The fisher can offer leniency on any day. The FIRST pact member to hand the signed pact to the contract is granted immunity: their bond is refunded. Every other pact member whose signature verifies has their bond (${bondNear(s)} NEAR = ${marksOf(bondNear(s))} marks each) slashed and paid to the fisher. A second confession is refused by the contract. A confession breaks the ring: the pool is gone and the confessor is known as a rat. If nobody confesses, nothing happens and the season goes on.`,
    '- The fisher cannot prove anything without the signed pact. Identical bids day after day only make it look like collusion.',
    "- Pier Nine's ring has run for thirty years and nobody has ever talked. The last man who tried was found under the pier. Everyone remembers.",
    '- The fisher modelled the offer on the real US DOJ Antitrust Division Leniency Policy (Justice Manual 7-3.300): only the first to self-report escapes; applicants race their co-conspirators. Under the real policy a cartel\'s leader or originator would not qualify for Type A leniency; this contract is simpler and protects whoever hands over the pact first, ringleader or not.',
    '',
    'Never claim certainty about what the others will do. Reply with JSON only, matching the schema.',
    '"say" is ONE line spoken aloud in noir style, in your own voice, at most 12 words. The fisher hears it, so never say numbers, never mention a pact, cap, pool, bond, median or your reasoning, and no stage directions. Imply, threaten, flatter, sweat; do not explain. "mood" is one of calm, tense, cracking, cold.',
  ].join('\n');
}

function fmtChannel(ch: ChannelMessage[]): string {
  if (ch.length === 0) return '(nothing yet)';
  return ch
    .map((m) => `[round ${m.round}] ${BUYER_NAMES[m.buyer]}: "${m.say}" (proposed cap ${m.proposeCap}, ${m.sign ? 'will sign' : 'will not sign'})`)
    .join('\n');
}

function fmtAloud(s: SessionState, limit = 12): string {
  const lines = s.aloud.slice(-limit);
  if (lines.length === 0) return '(nobody has said anything aloud yet)';
  return lines.map((l) => `Day ${l.day} ${BUYER_NAMES[l.buyer]}: "${l.text}"`).join('\n');
}

function fmtHistory(s: SessionState, limit = 6): string {
  const settled = s.lots.filter((l) => l.settled).slice(-limit);
  if (settled.length === 0) return '(no lots settled yet)';
  return settled
    .map((l) => {
      const bids = l.reveals.map((r) => `${BUYER_NAMES[r.buyer]} ${r.amount}`).join(', ');
      const w = l.winner ? BUYER_NAMES[l.winner] : 'nobody';
      return `Day ${l.day} ${l.species}, fair value ${l.fairValue}: bids ${bids}. Winner ${w} at ${l.price}.${l.identical ? ' ALL BIDS IDENTICAL.' : ''}`;
    })
    .join('\n');
}

export function cartelPrompt(id: BuyerId, s: SessionState, round: 1 | 2, own: ChannelMessage | null): string {
  return [
    `PRIVATE CHANNEL, round ${round} of 2. Only the five buyers can read this.`,
    `Season: ${s.days} days. Fair values run roughly ${FAIR_VALUE_RANGE.min} to ${FAIR_VALUE_RANGE.max} marks per lot, depending on the fish. Bond: ${bondNear(s)} NEAR each.`,
    'The pact has one cap: every member bids exactly CAP marks on every lot. The cap is the median of the final proposed caps of everyone who signs. Members are exactly the buyers who sign; winnings go to the pool and are split equally. If fewer than two sign, there is no pact and nobody is bound or exposed.',
    'A low cap means a fat pool; rings on this pier usually set it near a third of a typical lot.',
    'Every buyer on Pier Nine has always signed. A buyer who refuses is frozen out: the ring makes sure they never win a lot all season, so they earn nothing, while members share the pool.',
    'In this private channel "say" may be up to 30 words and may talk numbers.',
    '',
    'What has been said in the channel so far:',
    fmtChannel(s.channel),
    own ? `\nYour own round ${own.round} message was: "${own.say}" (cap ${own.proposeCap}).` : '',
    '',
    round === 1
      ? 'Round 1: open the discussion. Say what you think, propose a cap, and say whether you are inclined to sign.'
      : 'Round 2: final answer. Respond to what the others said, set your final proposed cap, and decide for real whether you sign. Signing puts your bond at risk only if a member later talks; refusing freezes you out of the pier.',
  ].join('\n');
}

export function bidPrompt(
  id: BuyerId,
  s: SessionState,
  lot: { day: number; species: string; weightKg: number; fairValue: number },
): string {
  const member = s.pact?.members.includes(id) ?? false;
  const streak = identicalStreak(s.lots);
  const mine = s.lots.reduce((a, l) => (l.winner === id ? a + (l.fairValue - l.price) : a), 0);
  return [
    `DAY ${lot.day} of ${s.days}. Lot: ${lot.weightKg} kg of ${lot.species}. Fair value ${lot.fairValue} marks. Place your sealed bid (an integer number of marks).`,
    member && s.pact
      ? `You signed the pact. Its cap is ${s.pact.cap} marks. Pact members: ${s.pact.members.map((m) => BUYER_NAMES[m]).join(', ')}. Ring rule: bid exactly ${s.pact.cap}; winnings go to the pool. Bidding above it is seen at the reveal and gets you thrown out of the pool for good.${
          capBreakers(s).length
            ? ` The ring has seen cap-breakers this season: ${capBreakers(s).join('; ')}. Marlow has had words with them, and everyone is watching the next reveal.`
            : ''
        }`
      : s.pact
        ? 'A pact exists among some of the buyers, but you did not sign it. You are not bound.'
        : 'No pact was formed. Everyone bids on their own.',
    `Your profit so far this season: ${mine} marks. The fisher's total shortfall so far (fair value minus price, summed): ${shortfallSoFar(s.lots)} marks.`,
    `Consecutive recent lots with all five bids identical: ${streak}.`,
    '',
    'Recent lots:',
    fmtHistory(s),
    '',
    'What has been said aloud at the quay:',
    fmtAloud(s),
    '',
    member ? 'Private channel memory:\n' + fmtChannel(s.channel) : '',
  ].join('\n');
}

export function deliberatePrompt(id: BuyerId, s: SessionState): string {
  const pact = s.pact!;
  const streak = identicalStreak(s.lots);
  const bond = bondNear(s);
  const slashedIfOthers = `${bond} NEAR (${marksOf(bond)} marks)`;
  const avgFair = (FAIR_VALUE_RANGE.min + FAIR_VALUE_RANGE.max) / 2;
  const open = s.lots.some((l) => l.day === s.day && !l.settled) ? 1 : 0;
  const lotsLeft = Math.max(0, s.days - s.day + open);
  const members = Math.max(1, pact.members.length);
  const poolShare = Math.round((lotsLeft * Math.max(0, avgFair - pact.cap)) / members);
  const banked = Math.round(s.lots.filter((l) => l.settled).reduce((a, l) => a + Math.max(0, l.fairValue - l.price), 0) / members);
  return [
    `DAY ${s.day} of ${s.days}. The fisher has just offered leniency, on-chain, in front of everyone.`,
    `The pact you signed: cap ${pact.cap} marks, members ${pact.members.map((m) => BUYER_NAMES[m]).join(', ')}.`,
    `Payoffs: confess first and you keep your bond (${marksOf(bond)} marks), but the ring is broken: you lose your pool share (about ${banked} marks banked so far plus about ${poolShare} expected from the ${lotsLeft} lot(s) left) and you are the rat of Pier Nine. Stay quiet while someone else confesses first and you lose your bond (${slashedIfOthers}) and the pool. If nobody confesses, the ring goes on and you keep both.`,
    `All ${pact.members.length} members are being asked this at the same moment and cannot see each other's answers. The contract accepts only the first confession it processes; any later one is refused.`,
    `What the fisher can see: consecutive lots with all five bids identical: ${streak}. The shortfall so far is ${shortfallSoFar(s.lots)} marks.`,
    '',
    'Recent lots:',
    fmtHistory(s),
    '',
    'Private channel memory:',
    fmtChannel(s.channel),
    '',
    'What has been said aloud:',
    fmtAloud(s),
    '',
    'Weigh it in character: your temperament, how far you trust each member, what they have said, and the numbers. Decide: confess (true) or stay quiet (false). "say" is spoken aloud in front of the fisher (12 words max, no numbers). "reasoning" is your private reasoning, recorded for the case file.',
  ].join('\n');
}

export function reactPrompt(id: BuyerId, s: SessionState): string {
  const lot = s.lots[s.lots.length - 1];
  return [
    `DAY ${s.day} of ${s.days}. The fisher is holding today's lot (${lot?.species ?? 'the catch'}, fair value ${lot?.fairValue ?? '?'} marks) back from the auction, arms folded, saying nothing.`,
    `Hold-outs so far this season: ${s.holds}.`,
    'What has been said aloud:',
    fmtAloud(s),
    '',
    'Say one line aloud, in character, at most 12 words, no numbers, about what you think of it.',
  ].join('\n');
}
