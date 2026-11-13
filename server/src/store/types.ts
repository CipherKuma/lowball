import type { GameEvent } from '../../../shared/api.js';
import type { SessionState } from '../game/state.js';

export type ArtifactKind = 'receipt' | 'tx';

export interface Store {
  createSession(id: string, state: SessionState, ip: string): Promise<void>;
  loadState(id: string): Promise<SessionState | null>;
  saveState(id: string, state: SessionState): Promise<void>;
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
}
