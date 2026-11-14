// Shapes shared by the relayer modules. `DeskPayout` mirrors the desk contract's `Payout` JSON.

export type PayoutStatus = 'Pending' | 'Signed' | 'Failed';

export interface DeskPayout {
  season_id: number;
  status: PayoutStatus;
  to: string;
  amount_yocto: string;
  amount_wei: string;
  chain_id: number;
  nonce: number;
  max_fee_per_gas: string;
  max_priority_fee_per_gas: string;
  gas_limit: number;
  digest: string;
  unsigned_tx: string;
  big_r: string | null;
  s: string | null;
  recovery_id: number | null;
  verified: boolean;
  requested_block: number;
  signed_block: number | null;
  error: string | null;
}

export type RelayStatus = 'success' | 'reverted' | 'pending';

export interface RelayResult {
  seasonId: number;
  to: string;
  amountWei: string;
  sepoliaTx: string;
  status: RelayStatus;
  blockNumber?: number;
  /** false when the tx was already on chain and this call only read the receipt */
  broadcast: boolean;
}

export type ChainsigErrorCode =
  | 'NO_PAYOUT'
  | 'PAYOUT_PENDING'
  | 'PAYOUT_FAILED'
  | 'BAD_PAYOUT'
  | 'SIG_MISMATCH'
  | 'EVM_UNAVAILABLE'
  | 'EVM_REJECTED'
  | 'UNDERFUNDED'
  | 'NONCE_TOO_LOW'
  | 'NEAR_VIEW_FAILED';

export class ChainsigError extends Error {
  constructor(
    readonly code: ChainsigErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChainsigError';
  }
}
