import type { GameEvent } from '../../../shared/api.js';
import type { SessionState } from '../game/state.js';
import type { ArtifactKind, SpendEntry, Store, TeeJobRow } from './types.js';

export class D1Store implements Store {
  constructor(private db: D1Database) {}

  private authReady: Promise<unknown> | null = null;
  /** migrations/0004_auth.sql, also created on first use so a deploy never depends on running the migration first */
  private ensureAuth(): Promise<unknown> {
    this.authReady ??= this.db
      .batch([
        this.db.prepare('CREATE TABLE IF NOT EXISTS auth_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)'),
        this.db.prepare('CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL)'),
      ])
      .catch((e) => {
        this.authReady = null;
        throw e;
      });
    return this.authReady;
  }
  async putAuthNonce(nonce: string, expiresAt: number) {
    await this.ensureAuth();
    // housekeeping: spent or long-expired rows (an hour of grace so "expired" can still be told from "unknown")
    await this.db.prepare('DELETE FROM auth_nonces WHERE expires_at < ?').bind(Date.now() - 3_600_000).run();
    await this.db.prepare('INSERT INTO auth_nonces (nonce, expires_at, used) VALUES (?, ?, 0)').bind(nonce, expiresAt).run();
  }
  async consumeAuthNonce(nonce: string, now: number) {
    await this.ensureAuth();
    const r = await this.db.prepare('UPDATE auth_nonces SET used = 1 WHERE nonce = ? AND used = 0 AND expires_at >= ?').bind(nonce, now).run();
    if ((r.meta.changes ?? 0) > 0) return 'ok' as const;
    const row = await this.db.prepare('SELECT used FROM auth_nonces WHERE nonce = ?').bind(nonce).first<{ used: number }>();
    if (!row) return 'unknown' as const;
    return row.used === 1 ? ('used' as const) : ('expired' as const);
  }
  async putAuthSession(tokenHash: string, accountId: string, expiresAt: number) {
    await this.ensureAuth();
    await this.db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(Date.now()).run();
    await this.db.prepare('INSERT INTO auth_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(tokenHash, accountId, expiresAt).run();
  }
  async getAuthSession(tokenHash: string, now: number) {
    await this.ensureAuth();
    const row = await this.db.prepare('SELECT account_id FROM auth_sessions WHERE token_hash = ? AND expires_at >= ?').bind(tokenHash, now).first<{ account_id: string }>();
    return row?.account_id ?? null;
  }
  async deleteAuthSession(tokenHash: string) {
    await this.ensureAuth();
    await this.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
  }

  private ready: Promise<unknown> | null = null;
  /** migrations/0003_tee.sql, also created on first use so a deploy never depends on running the migration first */
  private ensureTee(): Promise<unknown> {
    this.ready ??= this.db.batch([
      this.db.prepare('CREATE TABLE IF NOT EXISTS tee_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, buyer TEXT NOT NULL, op TEXT NOT NULL, ok INTEGER NOT NULL, ms INTEGER NOT NULL)'),
      this.db.prepare('CREATE TABLE IF NOT EXISTS global_locks (name TEXT PRIMARY KEY, until INTEGER NOT NULL)'),
    ]).catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }
  async tryGlobalLock(name: string, ttlMs: number) {
    await this.ensureTee();
    const now = Date.now();
    const r = await this.db
      .prepare('INSERT INTO global_locks (name, until) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET until = excluded.until WHERE global_locks.until < ?')
      .bind(name, now + ttlMs, now)
      .run();
    return (r.meta.changes ?? 0) > 0;
  }
  async releaseGlobalLock(name: string) {
    await this.ensureTee();
    await this.db.prepare('UPDATE global_locks SET until = 0 WHERE name = ?').bind(name).run();
  }
  async addTeeJob(j: TeeJobRow) {
    await this.ensureTee();
    await this.db.prepare('INSERT INTO tee_jobs (at, buyer, op, ok, ms) VALUES (?, ?, ?, ?, ?)').bind(j.at, j.buyer, j.op, j.ok ? 1 : 0, Math.round(j.ms)).run();
  }
  async recentTeeJobs(limit: number) {
    await this.ensureTee();
    const r = await this.db.prepare('SELECT at, buyer, op, ok, ms FROM tee_jobs ORDER BY id DESC LIMIT ?').bind(limit).all<{ at: number; buyer: string; op: string; ok: number; ms: number }>();
    return r.results.map((x) => ({ at: x.at, buyer: x.buyer, op: x.op, ok: x.ok === 1, ms: x.ms }));
  }

  async createSession(id: string, state: SessionState, ip: string) {
    await this.db
      .prepare('INSERT INTO sessions (id, state, lock_until, created_at, ip) VALUES (?, ?, 0, ?, ?)')
      .bind(id, JSON.stringify(state), Date.now(), ip)
      .run();
  }
  async loadState(id: string) {
    const row = await this.db.prepare('SELECT state FROM sessions WHERE id = ?').bind(id).first<{ state: string }>();
    return row ? (JSON.parse(row.state) as SessionState) : null;
  }
  async getSessionRow(id: string) {
    const row = await this.db.prepare('SELECT state, created_at FROM sessions WHERE id = ?').bind(id).first<{ state: string; created_at: number }>();
    return row ? { state: JSON.parse(row.state) as SessionState, createdAt: row.created_at } : null;
  }
  async listSessionsByPlayer(accountId: string, limit: number) {
    const r = await this.db
      .prepare("SELECT id, state, created_at FROM sessions WHERE json_extract(state, '$.playerAccountId') = ? ORDER BY created_at DESC LIMIT ?")
      .bind(accountId, limit)
      .all<{ id: string; state: string; created_at: number }>();
    return r.results.map((x) => ({ id: x.id, state: JSON.parse(x.state) as SessionState, createdAt: x.created_at }));
  }
  async saveState(id: string, state: SessionState) {
    await this.db.prepare('UPDATE sessions SET state = ? WHERE id = ?').bind(JSON.stringify(state), id).run();
  }
  async tryLock(id: string, ttlMs: number) {
    const now = Date.now();
    const r = await this.db
      .prepare('UPDATE sessions SET lock_until = ? WHERE id = ? AND lock_until < ?')
      .bind(now + ttlMs, id, now)
      .run();
    return (r.meta.changes ?? 0) > 0;
  }
  async unlock(id: string) {
    await this.db.prepare('UPDATE sessions SET lock_until = 0 WHERE id = ?').bind(id).run();
  }
  async isLocked(id: string) {
    const row = await this.db.prepare('SELECT lock_until FROM sessions WHERE id = ?').bind(id).first<{ lock_until: number }>();
    return !!row && row.lock_until > Date.now();
  }
  async appendEvent(id: string, ev: GameEvent) {
    await this.db
      .prepare('INSERT INTO events (session_id, seq, body) VALUES (?, ?, ?)')
      .bind(id, ev.seq, JSON.stringify(ev))
      .run();
  }
  async listEvents(id: string, after: number, limit: number) {
    const r = await this.db
      .prepare('SELECT body FROM events WHERE session_id = ? AND seq > ? ORDER BY seq LIMIT ?')
      .bind(id, after, limit)
      .all<{ body: string }>();
    return r.results.map((x) => JSON.parse(x.body) as GameEvent);
  }
  async getEvent(id: string, seq: number) {
    const row = await this.db
      .prepare('SELECT body FROM events WHERE session_id = ? AND seq = ?')
      .bind(id, seq)
      .first<{ body: string }>();
    return row ? (JSON.parse(row.body) as GameEvent) : null;
  }
  async lastSeq(id: string) {
    const row = await this.db
      .prepare('SELECT MAX(seq) AS m FROM events WHERE session_id = ?')
      .bind(id)
      .first<{ m: number | null }>();
    return row?.m ?? 0;
  }
  async addArtifact(id: string, kind: ArtifactKind, key: string, value: unknown) {
    await this.db
      .prepare(
        'INSERT INTO artifacts (session_id, kind, key, body, at) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(session_id, kind, key) DO UPDATE SET body = excluded.body',
      )
      .bind(id, kind, key, JSON.stringify(value), Date.now())
      .run();
  }
  async listArtifacts<T>(id: string, kind: ArtifactKind) {
    const r = await this.db
      .prepare('SELECT body FROM artifacts WHERE session_id = ? AND kind = ? ORDER BY at, key')
      .bind(id, kind)
      .all<{ body: string }>();
    return r.results.map((x) => JSON.parse(x.body) as T);
  }
  async addSpend(e: SpendEntry) {
    await this.db
      .prepare('INSERT INTO spend (at, model, prompt_tokens, completion_tokens, usd) VALUES (?, ?, ?, ?, ?)')
      .bind(Date.now(), e.model, e.promptTokens, e.completionTokens, e.usd)
      .run();
  }
  async totalSpendUsd() {
    const row = await this.db.prepare('SELECT COALESCE(SUM(usd), 0) AS t FROM spend').first<{ t: number }>();
    return Number(row?.t ?? 0);
  }
  async reserveTts(sessionId: string, max: number) {
    await this.db.prepare('INSERT INTO tts_usage (session_id, n) VALUES (?, 0) ON CONFLICT(session_id) DO NOTHING').bind(sessionId).run();
    const r = await this.db.prepare('UPDATE tts_usage SET n = n + 1 WHERE session_id = ? AND n < ?').bind(sessionId, max).run();
    return (r.meta.changes ?? 0) > 0;
  }
  async releaseTts(sessionId: string) {
    await this.db.prepare('UPDATE tts_usage SET n = MAX(0, n - 1) WHERE session_id = ?').bind(sessionId).run();
  }
  async countSessionsSince(ip: string, since: number) {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS n FROM sessions WHERE ip = ? AND created_at >= ?')
      .bind(ip, since)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
}
