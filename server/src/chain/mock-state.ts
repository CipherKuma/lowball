// State shapes and panic helpers of the mock chain (see mock.ts).
import type { ErrorCode } from '../../../shared/api.js';
import type { PayoutRoute, SeasonViewLot } from './types.js';

export class Panic extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
export const ensure = (c: boolean, code: ErrorCode) => {
  if (!c) throw new Panic(code);
};

export interface Lot extends SeasonViewLot {
  commits: Map<number, string>;
  revealMap: [number, number][];
}
export interface Window {
  day: number;
  openBlock: number;
  /** the yielded receipt has not resumed or timed out yet */
  pending: boolean;
}
export interface Season {
  player: string;
  buyers: string[];
  posted: boolean[];
  slashed: boolean[];
  refunded: boolean[];
  pk: Uint8Array[];
  bond: bigint;
  days: number;
  day: number;
  status: 'Open' | 'Confessed' | 'Closed';
  lots: Lot[];
  leniencyDay: number | null;
  win: Window | null;
  windows: number;
  holdouts: number;
  payoutEvm: string | null;
  payoutRoute: PayoutRoute;
  routeAt: number;
  firstConfessor: number | null;
  verified: number[];
  slashedTotal: bigint;
  payout: bigint;
  shortfall: number;
  pactCap: number | null;
  pactNonce: string | null;
  confessedDay: number | null;
}

