import type { BuyerId, ErrorCode } from '../../../shared/api.js';
import type { TxResult } from '../near/signer.js';

export type { TxResult };

export interface PactJson {
  season_id: number;
  cap: number;
  members: string[];
  nonce: string;
}
export interface PactSigJson {
  signer: string;
  signature: string; // base64, 64 bytes
}

export interface SeasonViewLot {
  day: number;
  species: string;
  fair_value: number;
  committed: string[];
  reveals: { buyer: string; amount: number }[];
  settled: boolean;
  winner: string | null;
  price: number;
  identical: boolean;
}

export interface SeasonView {
  season_id: number;
  player: string;
  buyers: string[];
  bonds: { buyer: string; posted: boolean; slashed: boolean; refunded: boolean }[];
  bond: string;
  day: number;
  days: number;
  status: 'Open' | 'Confessed' | 'Closed' | string;
  lots: SeasonViewLot[];
  leniency_day: number | null;
  leniency_open: boolean;
  first_confessor: string | null;
  verified_signers: string[];
  slashed_total: string;
  player_payout: string;
  shortfall: number;
  pact_cap: number | null;
  pact_nonce: string | null;
  confessed_day: number | null;
}

export interface LeniencyCheck {
  ok: boolean;
  errorCode?: ErrorCode;
  message?: string;
}

/** Everything the game engine needs from NEAR. Implemented by RealChain and MockChain. */
export interface Chain {
  readonly contractId: string;
  readonly houseId: string;
  /** spendable house balance in yocto */
  houseBalance(): Promise<bigint>;
  createPlayer(playerPublicKey: string): Promise<{ accountId: string; tx: TxResult }>;
  /** top up a buyer so it can cover the bond plus gas; returns tx when a transfer was needed */
  ensureBuyerFunds(buyer: BuyerId, accountId: string, needYocto: bigint): Promise<TxResult | null>;
  createSeason(player: string, buyers: string[], days: number, bondYocto: bigint): Promise<TxResult & { seasonId?: number }>;
  postBond(buyer: BuyerId, seasonId: number, bondYocto: bigint): Promise<TxResult>;
  openLot(seasonId: number, species: string, fairValue: number): Promise<TxResult>;
  commitBid(buyer: BuyerId, seasonId: number, hash: Uint8Array): Promise<TxResult>;
  revealBid(buyer: BuyerId, seasonId: number, amount: number, salt: Uint8Array): Promise<TxResult>;
  settleLot(seasonId: number): Promise<TxResult>;
  confess(buyer: BuyerId, seasonId: number, pact: PactJson, sigs: PactSigJson[]): Promise<TxResult>;
  closeSeason(seasonId: number): Promise<TxResult>;
  getSeason(seasonId: number): Promise<SeasonView>;
  /** verify that txHash is the player's successful offer_leniency for this season */
  verifyLeniencyTx(txHash: string, playerAccountId: string, seasonId: number): Promise<LeniencyCheck>;
}
