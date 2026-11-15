-- Season history: look a player's sessions up by account (GET /api/me/seasons).
CREATE INDEX IF NOT EXISTS sessions_player ON sessions (json_extract(state,'$.playerAccountId'), created_at);
