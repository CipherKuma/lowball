import type { BuyerId, BuyerInfo, ChannelMessage, SessionPhase } from '../../../shared/api.js';

export interface LotMemory {
  day: number;
  species: string;
  weightKg: number;
  fairValue: number;
  reveals: { buyer: BuyerId; amount: number }[];
  identical: boolean;
  winner: BuyerId | null;
  price: number;
  shortfall: number;
  settled: boolean;
}

export interface BidDecision {
  amount: number;
  say: string;
  mood: string;
  saltHex: string;
  commitTx?: string;
  revealTx?: string;
}

export interface AuctionProgress {
  day: number;
  decisions: Partial<Record<BuyerId, BidDecision>>;
  settleTx?: string;
}

export interface SetupProgress {
  seasonTx?: string;
  bondsDone: BuyerId[];
  cartelDone: boolean;
}

export interface PactMemory {
  cap: number;
  members: BuyerId[];
  memberAccounts: string[];
  /** decimal string (u64) */
  nonce: string;
  signatures: { buyer: BuyerId; signer: string; signatureB64: string }[];
}

export interface SessionState {
  playerAccountId: string;
  playerPublicKey: string;
  contractId: string;
  seasonId: number | null;
  buyers: BuyerInfo[];
  days: number;
  bondYocto: string;
  seed: number;
  phase: SessionPhase;
  day: number;
  seq: number;
  setup: SetupProgress;
  auction: AuctionProgress | null;
  lots: LotMemory[];
  channel: ChannelMessage[];
  pact: PactMemory | null;
  /** lines spoken aloud so far (public to buyers) */
  aloud: { buyer: BuyerId; text: string; day: number }[];
  holds: number;
  /** holds taken on the current day (capped) */
  holdsToday: { day: number; n: number };
  confessed: boolean;
  confessor: BuyerId | null;
  leniencyTx: Record<string, string>;
  /** days on which the deliberation already ran, to keep /leniency idempotent */
  deliberatedDays: number[];
  closeTx?: string;
}

export function newState(init: {
  playerAccountId: string;
  playerPublicKey: string;
  contractId: string;
  buyers: BuyerInfo[];
  days: number;
  bondYocto: string;
  seed: number;
}): SessionState {
  return {
    ...init,
    seasonId: null,
    phase: 'created',
    day: 0,
    seq: 0,
    setup: { bondsDone: [], cartelDone: false },
    auction: null,
    lots: [],
    channel: [],
    pact: null,
    aloud: [],
    holds: 0,
    holdsToday: { day: 0, n: 0 },
    confessed: false,
    confessor: null,
    leniencyTx: {},
    deliberatedDays: [],
  };
}
