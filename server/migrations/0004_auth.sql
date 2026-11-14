-- Wallet sign-in (NEP-413): single-use challenges and hashed bearer sessions.
-- D1Store also creates these on first use, so applying this migration is optional.
CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
