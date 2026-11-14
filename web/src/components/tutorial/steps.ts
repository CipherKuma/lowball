/** The walkthrough script: one short line per step, what lights up, and how the step advances. */
export type Lit = 'slate' | 'buyers' | 'sell' | 'envelopes' | 'ledger' | 'sully' | 'backroom' | 'leniency' | 'verdict' | null;
export type Advance = 'next' | 'sell' | 'lean' | 'ask' | 'leave' | 'offer' | 'done';

export interface Step {
  id: string;
  line: string;
  lit: Lit;
  advance: Advance;
  /** what the player should do, shown under the line when the step waits on them */
  doThis?: string;
}

export const STEPS: Step[] = [
  { id: 'lot', lit: 'slate', advance: 'next', line: 'Every morning you land a catch. The board price is the real NOAA price for that fish, and the live sea sets the haul.' },
  { id: 'ring', lit: 'buyers', advance: 'next', line: 'Five buyers bid for it in sealed envelopes. Before the season, they met in private and agreed on a price.' },
  { id: 'sell', lit: 'sell', advance: 'sell', line: 'Open the envelopes and sell.', doThis: 'Press Open the bids & sell.' },
  { id: 'tell', lit: 'envelopes', advance: 'next', line: 'Five envelopes. One number. That is a ring, and the gap to the board price is taken from you. Every identical day goes on the record.' },
  { id: 'lean', lit: 'sully', advance: 'lean', line: 'Once a day you can lean on one buyer in the back room.', doThis: 'Click Sully Brack.' },
  { id: 'ask', lit: 'backroom', advance: 'ask', line: 'Say it out loud, or type it. One question a day, so make it count.', doThis: 'Pick a question or type your own, then press Say it.' },
  { id: 'pressure', lit: 'backroom', advance: 'leave', line: 'He is rattled. Pressure builds, and what you said stays with him when you offer leniency.', doThis: 'Press Back to the table.' },
  { id: 'case', lit: 'ledger', advance: 'next', line: 'Day two: the same number again. Two matching days make a case, and leniency unlocks.' },
  { id: 'offer', lit: 'leniency', advance: 'offer', line: 'Offer leniency. The first buyer to hand the contract their signed pact walks free. The rest lose their bonds to you.', doThis: 'Press Offer leniency.' },
  { id: 'done', lit: 'buyers', advance: 'done', line: 'That is the game. In a real season every move is a NEAR transaction and the buyers decide for themselves. They do not always crack.' },
];

export const QUESTIONS = ['Four envelopes said sixty yesterday. Who told you to write it?', 'Your boss signed a pact. You know what happens to the one who talks last?'];
export const ANSWER = "I don't know what you mean. Same? That's just… bad luck, right?";
export const TELL = 'He keeps turning his cap in his hands.';
