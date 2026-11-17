export interface Env {
  DB: D1Database;
  // secrets
  HOUSE_PRIVATE_KEY: string;
  BUYER_KEYS_JSON: string;
  NEARAI_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  // vars (optional overrides of src/generated/config.json)
  HOUSE_ACCOUNT_ID?: string;
  CONTRACT_ID?: string;
  NEARAI_MODEL?: string;
  NEARAI_BASE_URL?: string;
  RPC_URLS?: string; // comma separated
  SEASON_DAYS?: string;
  BOND_NEAR?: string;
  MIN_TREASURY_NEAR?: string;
  ALLOWED_ORIGIN?: string;
  MAX_SESSIONS_PER_IP_HOUR?: string;
  /** cumulative NEAR AI spend cap in USD (default 8, src/pricing.ts) */
  NEARAI_BUDGET_USD?: string;
  /** upstream ElevenLabs calls per session (default 40) */
  TTS_MAX_PER_SESSION?: string;
  /** payout desk account (default desk.<contract>) and Sepolia RPC urls, comma separated */
  DESK_ACCOUNT_ID?: string;
  SEPOLIA_RPC_URLS?: string;
  /** "1": each buyer's pact key lives in an OutLayer TDX enclave (outlayer/deployed.json); default off */
  TEE_BUYERS?: string;
  /** auto (default) | on | off: per season, enclave signing only when OutLayer looks healthy (src/tee/mode.ts) */
  TEE_MODE?: string;
  /** NEAR attached to each OutLayer request_execution: the run plus output storage (1e19 yocto per byte); the rest is refunded (default 0.09) */
  OUTLAYER_DEPOSIT_NEAR?: string;
  /** NEP-413 recipient the wallet signs for (default play.lowball-game.pages.dev) */
  AUTH_RECIPIENT?: string;
  DEBUG?: string;
}
