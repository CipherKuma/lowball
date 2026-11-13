import type { ContractErrorCode, ErrorCode } from '../../shared/api.js';

export interface ErrorInfo {
  message: string;
  retryable: boolean;
  status: number;
}

/** Every contract error code mapped to a player-safe message. Tested exhaustively. */
export const CONTRACT_ERRORS: Record<ContractErrorCode, ErrorInfo> = {
  E_NOT_HOUSE: { message: 'Only the house account may do that.', retryable: false, status: 403 },
  E_BAD_ARGS: { message: 'The contract rejected the arguments.', retryable: false, status: 400 },
  E_NO_SEASON: { message: 'That season does not exist.', retryable: false, status: 404 },
  E_NO_KEY: { message: 'A buyer has no registered pact key.', retryable: false, status: 409 },
  E_BAD_KEY: { message: 'A registered pact key is malformed.', retryable: false, status: 400 },
  E_NOT_BUYER: { message: 'That account is not a buyer in this season.', retryable: false, status: 403 },
  E_NOT_PLAYER: { message: 'Only the fisher of this season may do that.', retryable: false, status: 403 },
  E_BAD_DEPOSIT: { message: 'The attached deposit does not match the bond.', retryable: false, status: 400 },
  E_BOND_POSTED: { message: 'The bond is already posted.', retryable: false, status: 409 },
  E_NO_BOND: { message: 'No bond has been posted.', retryable: false, status: 409 },
  E_BONDS_MISSING: { message: 'Not every buyer has posted a bond yet.', retryable: true, status: 409 },
  E_SEASON_OVER: { message: 'The season has no days left.', retryable: false, status: 409 },
  E_LOT_OPEN: { message: 'A lot is already open.', retryable: false, status: 409 },
  E_NO_LOT: { message: 'There is no open lot.', retryable: false, status: 409 },
  E_PAST_DAYS: { message: 'That is past the last day of the season.', retryable: false, status: 409 },
  E_ALREADY_COMMITTED: { message: 'This buyer already committed a bid today.', retryable: false, status: 409 },
  E_NO_COMMIT: { message: 'No bid was committed.', retryable: false, status: 409 },
  E_ALREADY_REVEALED: { message: 'This buyer already revealed.', retryable: false, status: 409 },
  E_BAD_REVEAL: { message: 'The reveal does not match the commitment.', retryable: false, status: 400 },
  E_NOT_READY: { message: 'Not every buyer has revealed yet.', retryable: true, status: 409 },
  E_NOT_FINISHED: { message: 'The season is not finished.', retryable: false, status: 409 },
  E_NO_DAY: { message: 'No lot has been opened yet.', retryable: false, status: 409 },
  E_NO_LENIENCY: { message: 'Leniency is not on offer.', retryable: false, status: 409 },
  E_SEASON_MISMATCH: { message: 'The pact was signed for another season.', retryable: false, status: 400 },
  E_NOT_MEMBER: { message: 'Not a member of the pact.', retryable: false, status: 403 },
  E_DUP_SIGNER: { message: 'A signer appears twice.', retryable: false, status: 400 },
  E_BAD_SIG: { message: 'A pact signature is invalid.', retryable: false, status: 400 },
  E_TOO_FEW: { message: 'Fewer than two valid signatures, or the confessor did not sign.', retryable: false, status: 400 },
  E_ALREADY_CONFESSED: { message: 'Someone else confessed first.', retryable: false, status: 409 },
  E_CLOSED: { message: 'The season is closed.', retryable: false, status: 409 },
  E_SEASON_OPEN: { message: 'The season is still open.', retryable: false, status: 409 },
  E_SLASHED: { message: 'That bond was slashed.', retryable: false, status: 409 },
  E_ALREADY_WITHDRAWN: { message: 'The bond is already withdrawn.', retryable: false, status: 409 },
};

export const SERVER_ERRORS: Record<string, ErrorInfo> = {
  BAD_REQUEST: { message: 'Invalid request.', retryable: false, status: 400 },
  NOT_FOUND: { message: 'Not found.', retryable: false, status: 404 },
  BAD_PHASE: { message: 'That action is not available right now.', retryable: false, status: 409 },
  BUSY: { message: 'The harbour is busy with the previous step.', retryable: true, status: 409 },
  RATE_LIMITED: { message: 'Too many sessions. Try again shortly.', retryable: true, status: 429 },
  TREASURY_LOW: { message: 'The house treasury is too low to open a new season.', retryable: true, status: 503 },
  RPC_UNAVAILABLE: { message: 'NEAR testnet RPC is unavailable.', retryable: true, status: 503 },
  TX_FAILED: { message: 'The transaction failed.', retryable: true, status: 502 },
  TX_NOT_FOUND: { message: 'Transaction not found on chain.', retryable: true, status: 404 },
  TX_MISMATCH: { message: 'That transaction is not an offer_leniency for this season.', retryable: false, status: 400 },
  MODEL_UNAVAILABLE: { message: 'The buyer model call failed.', retryable: true, status: 502 },
  MODEL_BAD_OUTPUT: { message: 'The buyer model returned unusable output.', retryable: true, status: 502 },
  TTS_UNAVAILABLE: { message: 'Voice synthesis is unavailable.', retryable: true, status: 502 },
  INTERNAL: { message: 'Internal error.', retryable: true, status: 500 },
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  constructor(code: ErrorCode, message?: string, opts?: { retryable?: boolean; status?: number }) {
    const info = errorInfo(code);
    super(message ?? info.message);
    this.code = code;
    this.retryable = opts?.retryable ?? info.retryable;
    this.status = opts?.status ?? info.status;
  }
}

export function errorInfo(code: ErrorCode): ErrorInfo {
  return (
    (CONTRACT_ERRORS as Record<string, ErrorInfo>)[code] ??
    SERVER_ERRORS[code] ??
    SERVER_ERRORS.INTERNAL!
  );
}

export function isContractCode(s: string): s is ContractErrorCode {
  return s in CONTRACT_ERRORS;
}

/** Find a stable contract error code inside a panic/failure string. */
export function extractContractCode(text: string): ContractErrorCode | null {
  const m = /E_[A-Z_]+/.exec(text);
  return m && isContractCode(m[0]) ? m[0] : null;
}

/** Convert anything thrown into a client-safe {error, code}. Never leaks stack traces. */
export function toApiError(e: unknown): { body: { error: string; code: ErrorCode }; status: number } {
  if (e instanceof AppError) return { body: { error: e.message, code: e.code }, status: e.status };
  return { body: { error: SERVER_ERRORS.INTERNAL!.message, code: 'INTERNAL' }, status: 500 };
}
