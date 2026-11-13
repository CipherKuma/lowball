// Lowball shared API types. Owned by the server agent; the web client imports these.
// Pure types plus a few constants: no runtime dependencies.

export const BUYER_IDS = ['marlow', 'odile', 'sully', 'ines', 'deacon'] as const;
export type BuyerId = (typeof BUYER_IDS)[number];

export const BUYER_NAMES: Record<BuyerId, string> = {
  marlow: 'Marlow Teague',
  odile: 'Odile Fenn',
  sully: 'Sully Brack',
  ines: 'Ines Varga',
  deacon: 'The Deacon',
};

export type Mood = 'calm' | 'tense' | 'cracking' | 'cold';

export interface BuyerInfo {
  id: BuyerId;
  name: string;
  accountId: string;
}

/** Contract error codes the server maps (stable strings from contract/src/errors.rs). */
export type ContractErrorCode =
  | 'E_NOT_HOUSE' | 'E_BAD_ARGS' | 'E_NO_SEASON' | 'E_NO_KEY' | 'E_BAD_KEY' | 'E_NOT_BUYER'
  | 'E_NOT_PLAYER' | 'E_BAD_DEPOSIT' | 'E_BOND_POSTED' | 'E_NO_BOND' | 'E_BONDS_MISSING'
  | 'E_SEASON_OVER' | 'E_LOT_OPEN' | 'E_NO_LOT' | 'E_PAST_DAYS' | 'E_ALREADY_COMMITTED'
  | 'E_NO_COMMIT' | 'E_ALREADY_REVEALED' | 'E_BAD_REVEAL' | 'E_NOT_READY' | 'E_NOT_FINISHED'
  | 'E_NO_DAY' | 'E_NO_LENIENCY' | 'E_SEASON_MISMATCH' | 'E_NOT_MEMBER' | 'E_DUP_SIGNER'
  | 'E_BAD_SIG' | 'E_TOO_FEW' | 'E_ALREADY_CONFESSED' | 'E_CLOSED' | 'E_SEASON_OPEN'
  | 'E_SLASHED' | 'E_ALREADY_WITHDRAWN';

/** Server-side error codes (HTTP error bodies and `error` events). */
export type ServerErrorCode =
  | 'BAD_REQUEST' | 'NOT_FOUND' | 'BAD_PHASE' | 'BUSY' | 'RATE_LIMITED' | 'TREASURY_LOW'
  | 'RPC_UNAVAILABLE' | 'TX_FAILED' | 'TX_NOT_FOUND' | 'TX_MISMATCH' | 'MODEL_UNAVAILABLE'
  | 'MODEL_BAD_OUTPUT' | 'TTS_UNAVAILABLE' | 'INTERNAL';

export type ErrorCode = ContractErrorCode | ServerErrorCode;

/** Body of every non-2xx response. */
export interface ApiError {
  error: string;
  code?: ErrorCode;
}

export type SessionPhase =
  | 'created'    // player account exists, season not yet created
  | 'lot_open'   // a lot is open; player may sell, hold, or offer leniency
  | 'settled'    // today's lot is settled; next_day opens the next lot (or closes the season)
  | 'closed'     // season closed (terminal)
  | 'failed';    // unrecoverable error (terminal)

export interface SessionStatus {
  phase: SessionPhase;
  /** a step/leniency request is currently running on the server */
  busy: boolean;
  day: number;
  days: number;
  seasonId: number | null;
  /** true when the player may sign offer_leniency now */
  leniencyAvailable: boolean;
  /** true once a confession has been settled on-chain */
  confessed: boolean;
  /** highest event seq written so far */
  lastSeq: number;
}

// ---- POST /api/session ----
export interface CreateSessionRequest {
  /** "ed25519:<base58>" browser-generated public key; becomes a FunctionCall key on the player account */
  playerPublicKey: string;
}
export interface CreateSessionResponse {
  sessionId: string;
  playerAccountId: string;
  contractId: string;
  seasonId: number | null;
  buyers: BuyerInfo[];
  days: number;
  bondYocto: string;
  network: 'testnet';
}

// ---- GET /api/session/:id/events?after=n ----
export interface EventsResponse {
  events: GameEvent[];
  status: SessionStatus;
}

// ---- POST /api/session/:id/step ----
export type StepAction = 'begin' | 'sell' | 'hold' | 'next_day';
export interface StepRequest {
  action: StepAction;
}
export interface StepResponse {
  ok: true;
  status: SessionStatus;
}

// ---- POST /api/session/:id/leniency ----
export interface LeniencyRequest {
  /** tx hash of the player's offer_leniency call, signed in the browser */
  txHash: string;
}
export interface LeniencyResponse {
  ok: true;
  /** buyer that won the confession race, or null if nobody confessed */
  confessor: BuyerId | null;
  status: SessionStatus;
}

// ---- GameEvent union ----
export interface EventBase {
  /** monotonically increasing per session, starting at 1 */
  seq: number;
  /** ms since epoch (server clock) */
  ts: number;
}

export interface SlashedBuyer {
  buyer: BuyerId;
  yocto: string;
}

export interface BidReveal {
  buyer: BuyerId;
  amount: number;
  tx: string;
}

export type GameEventBody =
  | { type: 'account_created'; accountId: string; tx: string }
  | { type: 'season_created'; seasonId: number; tx: string }
  | { type: 'bond_posted'; buyer: BuyerId; tx: string }
  | { type: 'cartel_forming' }
  /** Public flavour only. Emitted whether or not a pact formed, so it never leaks the outcome. */
  | { type: 'rumour'; text: string }
  | { type: 'day_opened'; day: number; species: string; weightKg: number; fairValue: number; tx: string }
  | { type: 'bid_committed'; buyer: BuyerId; tx: string }
  | { type: 'bids_revealed'; reveals: BidReveal[]; identical: boolean }
  | { type: 'lot_settled'; winner: BuyerId | null; price: number; shortfall: number; tx: string }
  | { type: 'line'; buyer: BuyerId; text: string; mood: Mood }
  | { type: 'leniency_open'; tx: string }
  | { type: 'deliberating'; buyer: BuyerId }
  | { type: 'confession_attempt'; buyer: BuyerId; ok: boolean; errorCode?: ErrorCode; tx: string }
  | { type: 'slashed'; confessor: BuyerId; slashed: SlashedBuyer[]; payoutYocto: string; tx: string }
  | { type: 'holdout' }
  | { type: 'season_closed'; tx: string }
  | { type: 'error'; code: ErrorCode; message: string; retryable: boolean };

export type GameEvent = EventBase & GameEventBody;
export type GameEventType = GameEventBody['type'];

// ---- Case File ----
export interface SignatureVerification {
  /** SHA-256 of the exact request bytes (hex) */
  requestHash: string;
  /** SHA-256 of the exact response bytes (hex) */
  responseHash: string;
  signatureKind: 'provider_tee' | 'gateway' | 'unknown';
  signingAlgo: string;
  signingAddress: string;
  /** text field returned by the gateway equals the locally computed hashes */
  textMatches: boolean;
  /** signature recovers/verifies to signingAddress */
  signatureValid: boolean;
  /** signing identity equals the one in a gateway attestation fetched before the completion */
  signerMatchesPreflight: boolean;
  /** TDX quote verification is NOT performed by this server; always false here */
  quoteVerified: false;
  /** overall: textMatches && signatureValid && signerMatchesPreflight */
  verified: boolean;
  error?: string;
}

export interface Receipt {
  chatId: string;
  kind: 'cartel' | 'bid' | 'deliberate' | 'react';
  buyer: BuyerId;
  day: number | null;
  model: string;
  /** raw signature payload as returned by GET /v1/signature/{chat_id}; null when it could not be fetched */
  signature: { text: string; signature: string; signing_address: string; signing_algo: string; signature_kind?: string } | null;
  verification: SignatureVerification;
  /** parsed structured output the buyer returned */
  output: unknown;
  createdAt: number;
}

export interface ChannelMessage {
  round: number;
  buyer: BuyerId;
  say: string;
  proposeCap: number;
  sign: boolean;
  mood: Mood;
  chatId: string;
}

export interface PactRecord {
  seasonId: number;
  cap: number;
  members: string[];
  nonce: number;
  /** hex of the exact signed message: "LOWBALL-PACT-v1:" ++ borsh(pact) */
  messageHex: string;
  signatures: { buyer: BuyerId; signer: string; signatureB64: string }[];
}

export interface TxRecord {
  label: string;
  hash: string;
  signer: string;
  ok: boolean;
  errorCode?: ErrorCode;
  at: number;
}

export interface CasefileResponse {
  sessionId: string;
  seasonId: number | null;
  contractId: string;
  playerAccountId: string;
  model: string;
  channel: ChannelMessage[];
  /** null when fewer than two buyers signed (no cartel formed) */
  pact: PactRecord | null;
  receipts: Receipt[];
  txs: TxRecord[];
  /** on-chain season view at the time of the request (null before the season exists) */
  chain: unknown | null;
  status: SessionStatus;
}
