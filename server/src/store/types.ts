import type { GameEvent } from '../../../shared/api.js';
import type { SessionState } from '../game/state.js';

export type ArtifactKind = 'receipt' | 'tx' | 'tee' | 'tee_error';

export interface SpendEntry {
  model: string;
  promptTokens: number;
  completionTokens: number;
  usd: number;
}

/** One OutLayer job attempt, newest first in recentTeeJobs: the health signal behind TEE_MODE=auto. */
export interface TeeJobRow {
  at: number;
  buyer: string;
  op: string;
  ok: boolean;
  ms: number;
}

export interface Store {
  createSession(id: string, state: SessionState, ip: string): Promise<void>;
  loadState(id: string): Promise<SessionState | null>;
  saveState(id: string, state: SessionState): Promise<void>;
  /** state plus the row's created_at (ms); null for an unknown id */
  getSessionRow(id: string): Promise<{ state: SessionState; createdAt: number } | null>;
  /** sessions whose state.playerAccountId is `accountId`, newest first */
  listSessionsByPlayer(accountId: string, limit: number): Promise<{ id: string; state: SessionState; createdAt: number }[]>;
  /** true when the lock was acquired */
  tryLock(id: string, ttlMs: number): Promise<boolean>;
  unlock(id: string): Promise<void>;
  isLocked(id: string): Promise<boolean>;
  appendEvent(id: string, ev: GameEvent): Promise<void>;
  listEvents(id: string, after: number, limit: number): Promise<GameEvent[]>;
  getEvent(id: string, seq: number): Promise<GameEvent | null>;
  lastSeq(id: string): Promise<number>;
  addArtifact(id: string, kind: ArtifactKind, key: string, value: unknown): Promise<void>;
  listArtifacts<T = unknown>(id: string, kind: ArtifactKind): Promise<T[]>;
  countSessionsSince(ip: string, sinceMs: number): Promise<number>;
  /** one row per NEAR AI completion (cumulative, all sessions) */
  addSpend(e: SpendEntry): Promise<void>;
  totalSpendUsd(): Promise<number>;
  /** Cross-session lock (not tied to a session row). True when acquired; it expires by itself after ttlMs. */
  tryGlobalLock(name: string, ttlMs: number): Promise<boolean>;
  releaseGlobalLock(name: string): Promise<void>;
  /** record one OutLayer job attempt; implementations may throw, callers must not let that break a game */
  addTeeJob(j: TeeJobRow): Promise<void>;
  recentTeeJobs(limit: number): Promise<TeeJobRow[]>;
  /** claim one upstream ElevenLabs call for this session; false when the session already used `max` */
  reserveTts(sessionId: string, max: number): Promise<boolean>;
  /** give a claimed call back (the upstream call failed and was not billed) */
  releaseTts(sessionId: string): Promise<void>;
  /** wallet sign-in challenge (base64 of 32 bytes), valid until expiresAt (ms) */
  putAuthNonce(nonce: string, expiresAt: number): Promise<void>;
  /** atomically spend a nonce: exactly one caller ever gets 'ok' */
  consumeAuthNonce(nonce: string, now: number): Promise<'ok' | 'used' | 'expired' | 'unknown'>;
  /** only the sha256 of the bearer token is stored */
  putAuthSession(tokenHash: string, accountId: string, expiresAt: number): Promise<void>;
  getAuthSession(tokenHash: string, now: number): Promise<string | null>;
  deleteAuthSession(tokenHash: string): Promise<void>;
}
