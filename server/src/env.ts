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
  DEBUG?: string;
}
