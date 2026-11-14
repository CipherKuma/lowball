-- OutLayer enclave health (TEE_MODE=auto reads the last jobs) and a cross-session lock for "register keys -> create_season".
-- D1Store also creates these on first use, so applying this migration is optional.
CREATE TABLE IF NOT EXISTS tee_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  buyer TEXT NOT NULL,
  op TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS global_locks (
  name TEXT PRIMARY KEY,
  until INTEGER NOT NULL
);
