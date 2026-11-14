-- Spend caps enforced by code: NEAR AI token spend (one row per completion) and ElevenLabs calls per session.
CREATE TABLE IF NOT EXISTS spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  usd REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS tts_usage (
  session_id TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);
