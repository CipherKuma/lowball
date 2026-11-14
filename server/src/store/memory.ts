import type { GameEvent } from '../../../shared/api.js';
import type { SessionState } from '../game/state.js';
import type { ArtifactKind, SpendEntry, Store, TeeJobRow } from './types.js';

/** In-memory Store used by tests and the sim harness. */
export class MemoryStore implements Store {
  states = new Map<string, SessionState>();
  locks = new Map<string, number>();
  events = new Map<string, GameEvent[]>();
  artifacts = new Map<string, { kind: ArtifactKind; key: string; value: unknown }[]>();
  sessions: { ip: string; at: number }[] = [];
  spend: SpendEntry[] = [];
  tts = new Map<string, number>();
  globalLocks = new Map<string, number>();
  teeJobs: TeeJobRow[] = [];

  async createSession(id: string, state: SessionState, ip: string) {
    this.states.set(id, structuredClone(state));
    this.sessions.push({ ip, at: Date.now() });
  }
  async loadState(id: string) {
    const s = this.states.get(id);
    return s ? structuredClone(s) : null;
  }
  async saveState(id: string, state: SessionState) {
    this.states.set(id, structuredClone(state));
  }
  async tryLock(id: string, ttlMs: number) {
    const until = this.locks.get(id) ?? 0;
    if (until > Date.now()) return false;
    this.locks.set(id, Date.now() + ttlMs);
    return true;
  }
  async unlock(id: string) {
    this.locks.delete(id);
  }
  async isLocked(id: string) {
    return (this.locks.get(id) ?? 0) > Date.now();
  }
  async appendEvent(id: string, ev: GameEvent) {
    const list = this.events.get(id) ?? [];
    list.push(structuredClone(ev));
    this.events.set(id, list);
  }
  async listEvents(id: string, after: number, limit: number) {
    return (this.events.get(id) ?? []).filter((e) => e.seq > after).slice(0, limit);
  }
  async getEvent(id: string, seq: number) {
    return (this.events.get(id) ?? []).find((e) => e.seq === seq) ?? null;
  }
  async lastSeq(id: string) {
    const list = this.events.get(id) ?? [];
    return list.length ? list[list.length - 1]!.seq : 0;
  }
  async addArtifact(id: string, kind: ArtifactKind, key: string, value: unknown) {
    const list = this.artifacts.get(id) ?? [];
    const i = list.findIndex((a) => a.kind === kind && a.key === key);
    const row = { kind, key, value: structuredClone(value) };
    if (i >= 0) list[i] = row;
    else list.push(row);
    this.artifacts.set(id, list);
  }
  async listArtifacts<T>(id: string, kind: ArtifactKind) {
    return (this.artifacts.get(id) ?? []).filter((a) => a.kind === kind).map((a) => a.value as T);
  }
  async addSpend(e: SpendEntry) {
    this.spend.push({ ...e });
  }
  async totalSpendUsd() {
    return this.spend.reduce((a, e) => a + e.usd, 0);
  }
  async tryGlobalLock(name: string, ttlMs: number) {
    if ((this.globalLocks.get(name) ?? 0) > Date.now()) return false;
    this.globalLocks.set(name, Date.now() + ttlMs);
    return true;
  }
  async releaseGlobalLock(name: string) {
    this.globalLocks.delete(name);
  }
  async addTeeJob(j: TeeJobRow) {
    this.teeJobs.unshift({ ...j });
  }
  async recentTeeJobs(limit: number) {
    return this.teeJobs.slice(0, limit).map((j) => ({ ...j }));
  }
  async reserveTts(sessionId: string, max: number) {
    const n = this.tts.get(sessionId) ?? 0;
    if (n >= max) return false;
    this.tts.set(sessionId, n + 1);
    return true;
  }
  async releaseTts(sessionId: string) {
    this.tts.set(sessionId, Math.max(0, (this.tts.get(sessionId) ?? 0) - 1));
  }
  async countSessionsSince(ip: string, since: number) {
    return this.sessions.filter((s) => s.ip === ip && s.at >= since).length;
  }
}
