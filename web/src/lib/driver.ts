import type {
  BuyerId,
  BuyerInfo,
  CasefileResponse,
  ForgeResponse,
  GameEvent,
  SessionStatus,
  StepAction,
} from '../../../shared/api';
import { ApiFailure, api } from './api';
import { expireSession, walletAuth } from './identity';
import { offerLeniencyWithWallet, type LeniencyState } from './identity/walletLeniency';
import { adoptFisherKey, freshFisherKey, signOfferLeniency, type FisherKey } from './wallet';

export type { LeniencyState } from './identity/walletLeniency';

/** guest: a throwaway key signs; wallet: the signed-in NEAR account is the player and signs offer_leniency itself */
export interface StartOptions {
  mode?: 'guest' | 'wallet';
  /** "pay me on Sepolia": slashed NEAR is paid cross-chain to this 0x address */
  payoutEvm?: string;
  /** pick up a season this player already started (after a reload, or from "Your seasons") instead of opening one */
  resume?: { meta: SessionMeta; fisherKey?: FisherKey };
}

export interface SessionMeta {
  sessionId: string;
  playerAccountId: string;
  /** who signs offer_leniency */
  playerKind?: 'guest' | 'wallet';
  contractId: string;
  buyers: BuyerInfo[];
  days: number;
  bondYocto: string;
}

export interface Driver {
  readonly kind: 'live' | 'preview';
  start(): Promise<SessionMeta>;
  step(action: StepAction): Promise<void>;
  /**
   * Sign offer_leniency (guest key or the connected wallet), then let the buyers deliberate. `onState` reports
   * awaiting-wallet / submitted / open. A wallet rejection resolves null after reporting 'rejected'.
   */
  leniency(seasonId: number, onState?: (s: LeniencyState) => void): Promise<BuyerId | null>;
  casefile(): Promise<CasefileResponse>;
  ttsUrl(seq: number): string | null;
  /** Corner one buyer in the back room: recorded speech or typed text. The answer arrives as an event. */
  interrogate(buyer: BuyerId, input: { audio?: Blob; text?: string }): Promise<void>;
  /** The cartel's private channel performed as audio (Case File, season closed). */
  wiretapUrl(): string | null;
  /** Case File drill: real forged/replayed/late confessions the contract must refuse. */
  forge(): Promise<ForgeResponse>;
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

  constructor(private readonly opts: StartOptions = {}) {}

  async start(): Promise<SessionMeta> {
    if (this.opts.resume) {
      if (this.opts.resume.fisherKey) adoptFisherKey(this.opts.resume.fisherKey);
      this.meta = this.opts.resume.meta;
      this.loop();
      return this.meta;
    }
    let s;
    if (this.opts.mode === 'wallet') {
      const auth = await walletAuth();
      try {
        s = await api.createWalletSession(auth.token, this.opts.payoutEvm);
      } catch (e) {
        if (e instanceof ApiFailure && e.code === 'AUTH_REQUIRED') {
          expireSession('Your sign-in expired. Sign in with your wallet again.', true);
        }
        throw e;
      }
    } else {
      s = await api.createSession(freshFisherKey().publicKey, this.opts.payoutEvm);
    }
    this.meta = {
      sessionId: s.sessionId,
      playerAccountId: s.playerAccountId,
      playerKind: s.playerKind ?? (this.opts.mode === 'wallet' ? 'wallet' : 'guest'),
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
        // a closed season still pages through its history (200 events a call) before polling stops
        const caughtUp = !r.events.length || this.after >= (r.status.lastSeq ?? 0);
        if ((r.status.phase === 'closed' || r.status.phase === 'failed') && caughtUp) this.stop();
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

  async leniency(seasonId: number, onState: (s: LeniencyState) => void = () => undefined): Promise<BuyerId | null> {
    if (!this.meta) throw new Error('No session');
    let hash: string | null;
    if (this.meta.playerKind === 'wallet') {
      const auth = await walletAuth();
      if (auth.accountId !== this.meta.playerAccountId) throw new Error('This season belongs to another account. Switch back or start a new season.');
      const r = await offerLeniencyWithWallet(auth.wallet, auth.accountId, this.meta.contractId, seasonId, onState);
      if (r.kind === 'rejected') return null;
      if (r.kind === 'failed') throw new Error(r.message);
      hash = r.txHash;
    } else {
      onState('submitted');
      hash = await signOfferLeniency(this.meta.playerAccountId, this.meta.contractId, seasonId);
      onState('open');
    }
    this.loop();
    try {
      const r = await api.leniency(this.id(), hash ?? undefined);
      return r.confessor;
    } catch (e) {
      if (e instanceof ApiFailure && e.code === 'AUTH_REQUIRED') expireSession('Your sign-in expired. Sign in with your wallet again.', true);
      throw e;
    }
  }

  casefile() {
    return api.casefile(this.id());
  }

  ttsUrl(seq: number) {
    return this.meta ? api.ttsUrl(this.meta.sessionId, seq) : null;
  }

  async interrogate(buyer: BuyerId, input: { audio?: Blob; text?: string }): Promise<void> {
    this.loop();
    await api.interrogate(this.id(), buyer, input);
  }

  wiretapUrl() {
    return this.meta ? api.wiretapUrl(this.meta.sessionId) : null;
  }

  forge() {
    return api.forge(this.id());
  }

  subscribe(fn: (e: GameEvent[], s: SessionStatus | null) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
      if (!this.listeners.size) this.stop();
    };
  }
}
