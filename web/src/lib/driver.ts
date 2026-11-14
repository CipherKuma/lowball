import type {
  BuyerId,
  BuyerInfo,
  CasefileResponse,
  GameEvent,
  SessionStatus,
  StepAction,
} from '../../../shared/api';
import { api } from './api';
import { freshFisherKey, signOfferLeniency } from './wallet';

export interface SessionMeta {
  sessionId: string;
  playerAccountId: string;
  contractId: string;
  buyers: BuyerInfo[];
  days: number;
  bondYocto: string;
}

export interface Driver {
  readonly kind: 'live' | 'preview';
  start(): Promise<SessionMeta>;
  step(action: StepAction): Promise<void>;
  /** Sign offer_leniency in the browser, then let the buyers deliberate. */
  leniency(seasonId: number): Promise<BuyerId | null>;
  casefile(): Promise<CasefileResponse>;
  ttsUrl(seq: number): string | null;
  subscribe(onEvents: (events: GameEvent[], status: SessionStatus | null) => void): () => void;
}

/** Talks to the Worker. Events arrive by polling; step calls block while the server works. */
export class LiveDriver implements Driver {
  readonly kind = 'live' as const;
  private meta: SessionMeta | null = null;
  private after = 0;
  private listeners = new Set<(e: GameEvent[], s: SessionStatus | null) => void>();
  private timer: number | null = null;
  private polling = false;

  async start(): Promise<SessionMeta> {
    const key = freshFisherKey();
    const s = await api.createSession(key.publicKey);
    this.meta = {
      sessionId: s.sessionId,
      playerAccountId: s.playerAccountId,
      contractId: s.contractId,
      buyers: s.buyers,
      days: s.days,
      bondYocto: s.bondYocto,
    };
    this.loop();
    return this.meta;
  }

  private id(): string {
    if (!this.meta) throw new Error('No session');
    return this.meta.sessionId;
  }

  private loop = () => {
    if (this.timer !== null) return;
    const tick = async () => {
      if (!this.meta || this.polling) return;
      this.polling = true;
      try {
        const r = await api.events(this.meta.sessionId, this.after);
        if (r.events.length) this.after = r.events[r.events.length - 1].seq;
        this.listeners.forEach((l) => l(r.events, r.status));
        if (r.status.phase === 'closed' || r.status.phase === 'failed') this.stop();
      } catch {
        /* transient; the next tick retries */
      } finally {
        this.polling = false;
      }
    };
    this.timer = window.setInterval(tick, 700);
    void tick();
  };

  private stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  async step(action: StepAction): Promise<void> {
    this.loop();
    await api.step(this.id(), action);
  }

  async leniency(seasonId: number): Promise<BuyerId | null> {
    if (!this.meta) throw new Error('No session');
    const hash = await signOfferLeniency(this.meta.playerAccountId, this.meta.contractId, seasonId);
    this.loop();
    const r = await api.leniency(this.id(), hash);
    return r.confessor;
  }

  casefile() {
    return api.casefile(this.id());
  }

  ttsUrl(seq: number) {
    return this.meta ? api.ttsUrl(this.meta.sessionId, seq) : null;
  }

  subscribe(fn: (e: GameEvent[], s: SessionStatus | null) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
      if (!this.listeners.size) this.stop();
    };
  }
}
