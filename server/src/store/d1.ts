import type { GameEvent } from '../../../shared/api.js';
import type { SessionState } from '../game/state.js';
import type { ArtifactKind, Store } from './types.js';

export class D1Store implements Store {
  constructor(private db: D1Database) {}

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
  async countSessionsSince(ip: string, since: number) {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS n FROM sessions WHERE ip = ? AND created_at >= ?')
      .bind(ip, since)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
}
