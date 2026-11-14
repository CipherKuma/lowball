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
  | 'E_SLASHED' | 'E_ALREADY_WITHDRAWN'
  // contract upgrade (BRIEF-2 U1/U2/U3)
  | 'E_LENIENCY_OPEN' | 'E_BAD_EVM' | 'E_NO_TOKEN' | 'E_NOT_TOKEN_OWNER' | 'E_MT_PARTIAL'
  | 'E_NEED_1_YOCTO' | 'E_SELF_TRANSFER' | 'E_NOT_CONTRACT'
  // confession now needs the confessor's own pact-key signature
  | 'E_BAD_CONFESSION_SIG';

/** Server-side error codes (HTTP error bodies and `error` events). */
export type ServerErrorCode =
  | 'BAD_REQUEST' | 'NOT_FOUND' | 'BAD_PHASE' | 'BUSY' | 'RATE_LIMITED' | 'TREASURY_LOW'
  | 'RPC_UNAVAILABLE' | 'TX_FAILED' | 'TX_NOT_FOUND' | 'TX_MISMATCH' | 'MODEL_UNAVAILABLE'
  | 'MODEL_BAD_OUTPUT' | 'TTS_UNAVAILABLE' | 'INTERNAL'
  // additive: spend caps and the cross-chain payout
  | 'BUDGET_EXHAUSTED' | 'TTS_LIMIT' | 'PAYOUT_EVM_FAILED'
  // additive: an OutLayer TEE job (buyer key in an Intel TDX enclave) failed or could not be verified
  | 'TEE_UNAVAILABLE'
  // additive: the voice interrogation (one per day) and its speech-to-text step
  | 'ALREADY_INTERROGATED' | 'STT_UNAVAILABLE'
  // additive: the Case File forgery drill (one per session)
  | 'ALREADY_FORGED';

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
  /**
   * true while the server is still waiting on the chain after leniency: the 200-block window has not
   * resolved (holdout pending) or the cross-chain payout has not landed. Keep polling events.
   */
  finalizing?: boolean;
  /** highest event seq written so far */
  lastSeq: number;
}

// ---- POST /api/session ----
export interface CreateSessionRequest {
  /** "ed25519:<base58>" browser-generated public key; becomes a FunctionCall key on the player account */
  playerPublicKey: string;
  /**
   * Optional Sepolia address ("0x" + 40 hex). When set the slashed NEAR is paid out cross-chain through
   * Chain Signatures (the `payout_evm` event); the server validates it with zod and passes it to create_season.
   */
  payoutEvm?: string;
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
  /** the validated payout address the season was created with, or null (NEAR payout) */
  payoutEvm?: string | null;
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

// ---- POST /api/session/:id/interrogate ----
// multipart/form-data: `buyer` (BuyerId) and EITHER `audio` (webm/ogg/mp4/mpeg, <= 15 s, <= 1.5 MB) OR `text` (<= 240 chars).
// One per day per session (409 ALREADY_INTERROGATED); only in lot_open/settled and before a confession (409 BAD_PHASE).
export interface InterrogateResponse {
  ok: true;
  /** what the fisher said (speech-to-text transcript when audio was sent) */
  question: string;
  buyer: BuyerId;
  answer: string;
  mood: Mood;
  tell: string;
  pressure: number;
  /** seq of the `interrogation` event; GET /api/tts?session=&seq= voices the answer */
  seq: number;
  status: SessionStatus;
}
// GET /api/session/:id/wiretap -> audio/mpeg (ElevenLabs Text-to-Dialogue, eleven_v3). 409 BAD_PHASE until the season is closed.

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
  | {
      type: 'day_opened';
      day: number;
      species: string;
      weightKg: number;
      fairValue: number;
      tx: string;
      /** the real ex-vessel price behind fairValue (NOAA Fisheries FOSS); absent when `marketFallback` is true */
      market?: LotMarket;
      /** fairValue came from the prior formula because NOAA had no price for this species */
      marketFallback?: true;
    }
  | { type: 'bid_committed'; buyer: BuyerId; tx: string }
  | { type: 'bids_revealed'; reveals: BidReveal[]; identical: boolean }
  | { type: 'lot_settled'; winner: BuyerId | null; price: number; shortfall: number; tx: string }
  | { type: 'line'; buyer: BuyerId; text: string; mood: Mood }
  /** deadlineBlock: NEAR block height at which the on-chain 200-block window ends (always set by the server) */
  | { type: 'leniency_open'; tx: string; deadlineBlock?: number }
  | { type: 'deliberating'; buyer: BuyerId }
  | { type: 'confession_attempt'; buyer: BuyerId; ok: boolean; errorCode?: ErrorCode; tx: string }
  | {
      type: 'slashed';
      confessor: BuyerId;
      slashed: SlashedBuyer[];
      payoutYocto: string;
      tx: string;
      /** contract payout_route when the event was written: 'near' | 'evm_pending' (cross-chain payout follows) */
      payoutRoute?: string;
    }
  /**
   * reason 'timeout': the contract's 200-block yield expired with no confession (confirmed on-chain);
   * 'no_pact': fewer than two buyers signed, so nobody could confess. Always set by the server.
   */
  | { type: 'holdout'; reason?: 'timeout' | 'no_pact' }
  /** NEP-245 mt_mint of the day's catch (parsed from the open_lot receipt). amount = kg. */
  | { type: 'lot_minted'; tokenId: string; amount: number; tx: string }
  /** NEP-245 mt_transfer of the catch from escrow to the winning buyer (parsed from the settle_lot receipt). */
  | { type: 'lot_transferred'; tokenId: string; to: string; buyer?: BuyerId | null; memo?: string; tx: string }
  /** Cross-chain payout: Chain Signatures signed a Sepolia transfer to the fisher's address. */
  | {
      type: 'payout_evm';
      to: string;
      amountWei: string;
      sepoliaTx: string;
      nearTx: string;
      /** receipt state at emit time; a broadcast tx that is not yet mined is 'pending' */
      status?: 'success' | 'reverted' | 'pending';
    }
  /**
   * A buyer's act was decided and signed inside an OutLayer Intel TDX enclave (TEE_BUYERS=1).
   * jobId: OutLayer request id; attestationUrl: GET returns the TDX quote record for the job's transaction.
   * The optional fields are additive.
   */
  | {
      type: 'tee_signed';
      buyer: BuyerId;
      jobId: string;
      attestationUrl: string;
      /** 'pact': decided and signed the pact; 'confession': decided and signed the confession */
      act?: 'pact' | 'confession';
      /** what the enclave decided: sign | refuse (pact), confess | stay_quiet (confession) */
      decision?: string;
      /** the request_execution transaction on outlayer.testnet */
      tx?: string;
      /** sha256 of the exact WASM the enclave ran (its TEE key belongs to this build alone) */
      wasmSha256?: string;
    }
  /** Live sea state at New Bedford (Open-Meteo Marine), once per season; it scales every catch of the season. */
  | ({ type: 'sea' } & SeaState)
  /** The fisher cornered a buyer in the back room (voice or typed); `answer` is voiced via GET /api/tts. */
  | {
      type: 'interrogation';
      buyer: BuyerId;
      day: number;
      question: string;
      answer: string;
      mood: Mood;
      /** a visible nervous tic, for the UI */
      tell: string;
      /** this buyer's pressure after the exchange, 0..6 */
      pressure: number;
    }
  /** The Case File forgery drill: real testnet confessions the contract refused (POST /api/session/:id/forge). */
  | { type: 'forgery'; attempts: ForgeAttempt[]; drillSeasonId: number; cleanupTx?: string; skipped?: { kind: ForgeKind; reason: string }[] }
  /** Narrator's template recap after each settled lot (no model); voiced via GET /api/tts (narrator voice). */
  | { type: 'recap'; day: number; text: string }
  | { type: 'season_closed'; tx: string }
  | { type: 'error'; code: ErrorCode; message: string; retryable: boolean };

/** Real price of a lot's species (NOAA Fisheries FOSS national commercial landings, latest full year). */
export interface LotMarket {
  usdPerLb: number;
  year: number;
  source: 'NOAA Fisheries FOSS';
  url: string;
  /** the state with the most landed value that year */
  state?: string;
}

export type ForgeKind = 'forge' | 'replay' | 'late';

/** One confess the server really submitted to the contract. `tx` is the on-chain hash ('' only when it could not be sent). */
export interface ForgeAttempt {
  kind: ForgeKind;
  buyer: BuyerId;
  /** the season the tx targeted (the drill season for forge and replay, the real one for late) */
  seasonId: number;
  tx: string;
  /** the contract's own refusal code (E_BAD_CONFESSION_SIG, E_SEASON_MISMATCH, E_CLOSED) */
  errorCode?: ErrorCode;
  /** false for every attempt the contract refused. true would mean the contract ACCEPTED a forgery. */
  ok: boolean;
  note: string;
}

export interface ForgeResponse {
  ok: true;
  attempts: ForgeAttempt[];
  drillSeasonId: number;
  cleanupTx?: string;
  skipped?: { kind: ForgeKind; reason: string }[];
  /** seq of the `forgery` event */
  seq: number;
}

export interface SeaState {
  waveM: number;
  swellM: number;
  port: 'New Bedford, MA';
  source: 'Open-Meteo Marine';
  /** ISO time of the observation */
  at: string;
  /** multiplier applied to every catch weight this season: 1 calm, 0.75 at waves >= 2 m, 0.55 at >= 3.5 m */
  catchMultiplier: number;
  /** one line for the UI / narrator */
  text: string;
}

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
  /**
   * The response signer is bound by an Intel TDX quote that server/scripts/verify-attestation.ts verified in
   * full (DCAP chain, nonce and signer binding, RTMR3, GPU evidence) and recorded in the evidence file.
   * The Worker does not verify quotes itself; false whenever there is no matching evidence.
   */
  quoteVerified: boolean;
  /** overall: textMatches && signatureValid && signerMatchesPreflight */
  verified: boolean;
  error?: string;
}

export interface Receipt {
  chatId: string;
  kind: 'cartel' | 'bid' | 'deliberate' | 'react' | 'interrogate';
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

/** Outcome of the last full attestation verification run, matched against the live deployment. */
export interface AttestationSummary {
  /** the model's TDX quote and GPU evidence passed full verification AND the live signer is the verified one */
  verified: boolean;
  /** ISO time of the verification run; null when none was recorded */
  checkedAt: string | null;
  /** where the evidence JSON can be read; null when none was recorded */
  evidenceUrl: string | null;
  /** why verified is false */
  reason?: string;
}

/** One act signed inside an OutLayer TDX enclave. Re-check with `outlayer-verify tx <txHash> --network testnet`. */
export interface TeeActRecord {
  buyer: BuyerId;
  act: 'pact' | 'confession';
  decision: string;
  /** OutLayer request id */
  jobId: string;
  /** the request_execution transaction (signed by the house, runs the job) */
  txHash: string;
  attestationUrl: string;
  wasmSha256: string;
  /** the buyer's TEE-derived ed25519 key, base64 (the key registered on the contract) */
  publicKeyB64: string;
  /** base64 signature the contract verifies (pact or confession signature); null when the buyer declined */
  signatureB64: string | null;
  /** the enclave's own signed record of the decision (message and ed25519 signature, base64) */
  receipt: { message: string; signature: string };
  /** NEAR AI Cloud completion made inside the enclave, with the provider's response signature when fetched */
  nearAi: {
    chatId: string;
    requestSha256: string;
    responseSha256: string;
    signatureKind: string | null;
    signingAddress: string | null;
    /** the provider signature's text equals model:requestSha256:responseSha256 */
    textMatches: boolean | null;
    /** the provider's ECDSA signature recovers to its signing address */
    signatureValid: boolean | null;
  } | null;
  /** ms from sending the job to reading its result */
  ms: number;
  /** 1, or 2 when the first attempt failed and the job was retried once */
  attempts?: number;
  /** the server checked the signature and the receipt against the registered TEE key */
  signatureVerified: boolean;
  at: number;
}

export interface CasefileResponse {
  sessionId: string;
  seasonId: number | null;
  contractId: string;
  playerAccountId: string;
  model: string;
  /** attestation status of the buyer model; absent on servers that predate it */
  attestation?: AttestationSummary;
  channel: ChannelMessage[];
  /** null when fewer than two buyers signed (no cartel formed) */
  pact: PactRecord | null;
  receipts: Receipt[];
  txs: TxRecord[];
  /** acts signed inside OutLayer TDX enclaves; absent when TEE_BUYERS is off */
  tee?: TeeActRecord[];
  /** on-chain season view at the time of the request (null before the season exists) */
  chain: unknown | null;
  status: SessionStatus;
}
