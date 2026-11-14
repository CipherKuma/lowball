import type { BuyerId, GameEvent, GameEventBody, Receipt, TxRecord } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import type { Chain, TxResult } from '../chain/types.js';
import type { KeyPair } from '../near/keys.js';
import type { Llm } from '../llm/types.js';
import type { Store } from '../store/types.js';
import type { SessionState } from './state.js';

export interface GameConfig {
  days: number;
  bondYocto: bigint;
  minTreasuryYocto: bigint;
  /** refuse new sessions once cumulative NEAR AI spend reaches this many USD (undefined: no cap) */
  nearAiBudgetUsd?: number;
}

/** Cross-chain payout relayer (server/src/chainsig). Absent when the Worker has none configured. */
export interface PayoutRelay {
  relay(
    seasonId: number,
    o: { waitSignedMs: number; waitReceiptMs: number },
  ): Promise<{ to: string; amountWei: string; sepoliaTx: string; status: 'success' | 'reverted' | 'pending' }>;
}

export interface GameDeps {
  store: Store;
  chain: Chain;
  llm: Llm;
  pactKeys: Record<BuyerId, KeyPair>;
  config: GameConfig;
  now?: () => number;
  payout?: PayoutRelay;
  /** wait between chain polls (tests advance the mock chain here) */
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  /** wall-clock one HTTP request may spend waiting on the chain after leniency (Cloudflare proxy cuts at 100 s) */
  waitMs?: number;
  /** wall-clock one events poll may spend resuming a pending holdout/payout */
  lazyMs?: number;
}

/** Per-request handle on one session: owns the in-memory state, event sequencing and receipts. */
export class GameCtx {
  private receipts: Promise<Receipt>[] = [];
  constructor(
    readonly id: string,
    readonly state: SessionState,
    readonly deps: GameDeps,
  ) {}

  get chain(): Chain {
    return this.deps.chain;
  }

  private emitChain: Promise<unknown> = Promise.resolve();

  /** Events are written strictly in seq order so a poller never skips one. */
  emit(body: GameEventBody): Promise<GameEvent> {
    const job = this.emitChain.then(async () => {
      this.state.seq += 1;
      const ev = { ...body, seq: this.state.seq, ts: (this.deps.now ?? Date.now)() } as GameEvent;
      await this.deps.store.appendEvent(this.id, ev);
      return ev;
    });
    this.emitChain = job.catch(() => undefined);
    return job;
  }

  save(): Promise<void> {
    return this.deps.store.saveState(this.id, this.state);
  }

  /** Like must(), but returns the whole result (receipt logs included). */
  async mustTx(label: string, signer: string, p: Promise<TxResult>): Promise<TxResult> {
    const r = await p;
    await this.recordTx(label, signer, r);
    if (!r.ok) throw new AppError(r.errorCode ?? 'TX_FAILED', r.failure ? `${label}: ${r.errorCode ?? 'failed'}` : undefined);
    return r;
  }

  sleep(ms: number): Promise<void> {
    return (this.deps.sleep ?? ((n) => new Promise<void>((r) => setTimeout(r, n))))(ms);
  }

  /** Record a tx for the case file and return its hash; throws AppError when the tx failed. */
  async must(label: string, signer: string, p: Promise<TxResult>): Promise<string> {
    const r = await p;
    await this.recordTx(label, signer, r);
    if (!r.ok) throw new AppError(r.errorCode ?? 'TX_FAILED', r.failure ? `${label}: ${r.errorCode ?? 'failed'}` : undefined);
    return r.hash;
  }

  async recordTx(label: string, signer: string, r: TxResult): Promise<void> {
    const rec: TxRecord = { label, hash: r.hash, signer, ok: r.ok, errorCode: r.errorCode, at: Date.now() };
    await this.deps.store.addArtifact(this.id, 'tx', `${rec.at}:${r.hash}`, rec);
  }

  track(receipt: Promise<Receipt>): void {
    this.receipts.push(receipt);
  }

  /** Persist every NEAR AI receipt gathered during this request (call before the request ends). */
  async flushReceipts(): Promise<void> {
    const pending = this.receipts.splice(0);
    const done = await Promise.all(pending);
    for (const r of done) await this.deps.store.addArtifact(this.id, 'receipt', `${r.createdAt}:${r.chatId}:${r.buyer}`, r);
  }

  say(buyer: BuyerId, text: string, mood: string): Promise<GameEvent> {
    this.state.aloud.push({ buyer, text, day: this.state.day });
    if (this.state.aloud.length > 60) this.state.aloud.splice(0, this.state.aloud.length - 60);
    const m = (['calm', 'tense', 'cracking', 'cold'] as const).find((x) => x === mood) ?? 'calm';
    return this.emit({ type: 'line', buyer, text, mood: m });
  }
}
