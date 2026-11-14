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
  weight_kg: number;
  token_id: string;
  token_owner: string;
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
  /** window live right now (yield pending, same day, within 200 blocks, season Open) */
  leniency_open: boolean;
  leniency_open_block: number | null;
  /** open + 200 */
  leniency_deadline_block: number | null;
  /** windows that timed out with no confession */
  holdouts: number;
  leniency_windows: number;
  first_confessor: string | null;
  verified_signers: string[];
  slashed_total: string;
  player_payout: string;
  shortfall: number;
  pact_cap: number | null;
  pact_nonce: string | null;
  confessed_day: number | null;
  payout_evm: string | null;
  payout_route: PayoutRoute;
}

export type PayoutRoute = 'none' | 'near' | 'evm_pending' | 'evm' | 'evm_failed_near';

export interface LeniencyCheck {
  ok: boolean;
  errorCode?: ErrorCode;
  message?: string;
  /** block the window opened at and the block it expires at (open + 200), read from get_season */
  openBlock?: number;
  deadlineBlock?: number;
}

export interface ConfessOptions {
  /** the season has payout_evm: the confess call forwards to the desk and needs 250 Tgas (else 30) */
  payoutEvm?: boolean;
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
  /** payoutEvm: optional "0x"+40 hex Sepolia address; omitted means the NEAR payout path */
  createSeason(player: string, buyers: string[], days: number, bondYocto: bigint, payoutEvm?: string): Promise<TxResult & { seasonId?: number }>;
  postBond(buyer: BuyerId, seasonId: number, bondYocto: bigint): Promise<TxResult>;
  /** mints the NEP-245 token (amount = weightKg); the receipt logs carry the mt_mint event */
  openLot(seasonId: number, species: string, fairValue: number, weightKg: number): Promise<TxResult>;
  commitBid(buyer: BuyerId, seasonId: number, hash: Uint8Array): Promise<TxResult>;
  revealBid(buyer: BuyerId, seasonId: number, amount: number, salt: Uint8Array): Promise<TxResult>;
  settleLot(seasonId: number): Promise<TxResult>;
  confess(buyer: BuyerId, seasonId: number, pact: PactJson, sigs: PactSigJson[], opts?: ConfessOptions): Promise<TxResult>;
  closeSeason(seasonId: number): Promise<TxResult>;
  getSeason(seasonId: number): Promise<SeasonView>;
  /** current block height (the leniency window is measured in blocks) */
  blockHeight(): Promise<number>;
  /**
   * Verify that txHash is the player's offer_leniency for this season. offer_leniency is a pending NEP-519
   * yield, so this confirms inclusion and that the window is open on-chain; it never waits for execution.
   */
  verifyLeniencyTx(txHash: string, playerAccountId: string, seasonId: number): Promise<LeniencyCheck>;
}
