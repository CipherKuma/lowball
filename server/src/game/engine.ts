import type {
  BuyerId,
  CasefileResponse,
  CreateSessionResponse,
  EventsResponse,
  LeniencyResponse,
  PactRecord,
  Receipt,
  SessionStatus,
  StepAction,
  StepResponse,
  TeeActRecord,
  TxRecord,
} from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { debug } from '../log.js';
import type { TxResult } from '../near/signer.js';
import { pactMessageHex } from '../near/pact.js';
import { buyerInfos } from './cast.js';
import { GameCtx, type GameDeps } from './ctx.js';
import { hold, nextDay, sell } from './days.js';
import { resolveFinalize } from './finalize.js';
import { runLeniency } from './leniency.js';
import { CASE_DAYS, caseDays } from './prompts.js';
import { beginSeason } from './setup.js';
import { newState, type SessionState } from './state.js';

const LOCK_TTL_MS = 170_000;

export function statusOf(s: SessionState, busy: boolean): SessionStatus {
  return {
    phase: s.phase,
    busy,
    day: s.day,
    days: s.days,
    seasonId: s.seasonId,
    leniencyAvailable:
      !s.confessed &&
      !s.finalize &&
      (s.phase === 'lot_open' || s.phase === 'settled') &&
      !s.deliberatedDays.includes(s.day) &&
      caseDays(s.lots) >= CASE_DAYS,
    confessed: s.confessed,
    finalizing: s.finalize !== null,
    lastSeq: s.seq,
  };
}

function newSessionId(): string {
  return crypto.randomUUID();
}

/** The NEAR AI spend cap, enforced here (not by a prompt): no new season once the ledger reaches the budget. */
async function ensureBudget(deps: GameDeps): Promise<void> {
  const cap = deps.config.nearAiBudgetUsd;
  if (cap === undefined) return;
  if ((await deps.store.totalSpendUsd()) >= cap) throw new AppError('BUDGET_EXHAUSTED');
}

export async function createSession(
  deps: GameDeps,
  playerPublicKey: string,
  ip: string,
  payoutEvm?: string,
  /** wallet mode: the player is this signed-in account; nothing is created or funded for it */
  wallet?: { accountId: string },
): Promise<CreateSessionResponse & { playerKind: 'guest' | 'wallet' }> {
  const { chain, store, config } = deps;
  await ensureBudget(deps);
  const bal = await chain.houseBalance();
  if (bal < config.minTreasuryYocto) throw new AppError('TREASURY_LOW');
  const buyers = buyerInfos(chain.houseId);
  let accountId: string;
  let tx: TxResult | null = null;
  if (wallet) {
    // the house and the buyers are never players of their own seasons
    if (wallet.accountId === chain.houseId || buyers.some((b) => b.accountId === wallet.accountId)) {
      throw new AppError('BAD_REQUEST', 'That account cannot play.');
    }
    accountId = wallet.accountId;
  } else {
    const made = await chain.createPlayer(playerPublicKey);
    if (!made.tx.ok) throw new AppError(made.tx.errorCode ?? 'TX_FAILED', 'Could not create the fisher account.');
    accountId = made.accountId;
    tx = made.tx;
  }
  const id = newSessionId();
  const seedBytes = crypto.getRandomValues(new Uint32Array(1));
  const state = newState({
    playerAccountId: accountId,
    playerPublicKey,
    contractId: chain.contractId,
    buyers,
    days: config.days,
    bondYocto: config.bondYocto.toString(),
    seed: seedBytes[0]!,
    payoutEvm: payoutEvm ?? null,
  });
  state.playerKind = wallet ? 'wallet' : 'guest';
  await store.createSession(id, state, ip);
  const ctx = new GameCtx(id, state, deps);
  if (tx) {
    await ctx.recordTx('create_player', chain.houseId, tx);
    await ctx.emit({ type: 'account_created', accountId, tx: tx.hash });
  }
  await ctx.save();
  return {
    sessionId: id,
    playerAccountId: accountId,
    contractId: chain.contractId,
    seasonId: null,
    buyers: state.buyers,
    days: state.days,
    bondYocto: state.bondYocto,
    network: 'testnet',
    payoutEvm: state.payoutEvm,
    playerKind: wallet ? 'wallet' : 'guest',
  };
}

async function load(deps: GameDeps, id: string): Promise<SessionState> {
  const s = await deps.store.loadState(id);
  if (!s) throw new AppError('NOT_FOUND', 'No such session.');
  return s;
}

/**
 * Resume a pending holdout/payout from an events poll (the Worker has no alarms). One poller at a time holds
 * the session lock; everyone else just reads. Failures are retried by the next poll.
 */
async function resumePending(deps: GameDeps, id: string): Promise<void> {
  const { store } = deps;
  if (!(await store.tryLock(id, LOCK_TTL_MS))) return;
  let ctx: GameCtx | null = null;
  try {
    const state = await load(deps, id);
    if (!state.finalize || (deps.now ?? Date.now)() - state.finalize.checkedAt < 2500) return;
    state.seq = Math.max(state.seq, await store.lastSeq(id));
    ctx = new GameCtx(id, state, deps);
    await resolveFinalize(ctx, deps.lazyMs ?? 10_000);
  } catch (e) {
    debug('engine', 'resume failed', e instanceof AppError ? e.code : String(e));
  } finally {
    await ctx?.flushReceipts().catch(() => undefined);
    await store.unlock(id);
  }
}

export async function getEvents(deps: GameDeps, id: string, after: number): Promise<EventsResponse> {
  let s = await load(deps, id);
  if (s.finalize) {
    await resumePending(deps, id);
    s = await load(deps, id);
  }
  const [events, busy, last] = await Promise.all([
    deps.store.listEvents(id, after, 200),
    deps.store.isLocked(id),
    deps.store.lastSeq(id),
  ]);
  return { events, status: { ...statusOf(s, busy), lastSeq: Math.max(last, s.seq), playerKind: s.playerKind ?? 'guest' } as EventsResponse['status'] };
}

/** Run `job` under the session lock. Errors become `error` events unless the job already emitted one. */
async function locked<T>(deps: GameDeps, id: string, job: (ctx: GameCtx) => Promise<T>): Promise<{ ctx: GameCtx; out: T }> {
  const { store } = deps;
  const exists = await store.loadState(id);
  if (!exists) throw new AppError('NOT_FOUND', 'No such session.');
  if (!(await store.tryLock(id, LOCK_TTL_MS))) throw new AppError('BUSY');
  const state = await load(deps, id);
  state.seq = Math.max(state.seq, await store.lastSeq(id));
  const ctx = new GameCtx(id, state, deps);
  try {
    const out = await job(ctx);
    return { ctx, out };
  } catch (e) {
    debug('engine', 'job failed', e instanceof AppError ? e.code : String(e));
    const known = e instanceof AppError;
    await ctx
      .emit({
        type: 'error',
        code: known ? e.code : 'INTERNAL',
        message: known ? e.message : 'Something went wrong on the quay.',
        retryable: known ? e.retryable : true,
      })
      .catch(() => undefined);
    await ctx.save().catch(() => undefined);
    throw e;
  } finally {
    await ctx.flushReceipts().catch(() => undefined);
    await store.unlock(id);
  }
}

export async function step(deps: GameDeps, id: string, action: StepAction): Promise<StepResponse> {
  const { ctx } = await locked(deps, id, async (ctx) => {
    if (ctx.state.finalize) throw new AppError('BAD_PHASE', 'The buyers are still settling the leniency offer.');
    switch (action) {
      case 'begin':
        return beginSeason(ctx);
      case 'sell':
        return sell(ctx);
      case 'hold':
        return hold(ctx);
      case 'next_day':
        return nextDay(ctx);
    }
  });
  return { ok: true, status: statusOf(ctx.state, false) };
}

export async function leniency(deps: GameDeps, id: string, txHash: string | null): Promise<LeniencyResponse> {
  const { ctx, out } = await locked(deps, id, (c) => {
    // Backstop for the UI gate: leniency needs a case on the record first.
    if (caseDays(c.state.lots) < (c.deps.config.minCaseDays ?? CASE_DAYS)) {
      throw new AppError('BAD_PHASE', `You need a case first: ${CASE_DAYS} days of identical bids on the record.`);
    }
    return runLeniency(c, txHash);
  });
  return { ok: true, confessor: out.confessor, status: statusOf(ctx.state, false) };
}

export async function casefile(deps: GameDeps, id: string): Promise<CasefileResponse> {
  const s = await load(deps, id);
  if (s.phase !== 'closed') throw new AppError('BAD_PHASE', 'The case file is sealed until the season closes.');
  const receipts = await deps.store.listArtifacts<Receipt>(id, 'receipt');
  const txs = await deps.store.listArtifacts<TxRecord>(id, 'tx');
  const tee = s.mode === 'enclave' ? await deps.store.listArtifacts<TeeActRecord>(id, 'tee') : undefined;
  let pact: PactRecord | null = null;
  if (s.pact && s.seasonId !== null) {
    pact = {
      seasonId: s.seasonId,
      cap: s.pact.cap,
      members: s.pact.memberAccounts,
      nonce: Number(s.pact.nonce),
      messageHex: pactMessageHex({
        seasonId: s.seasonId,
        cap: s.pact.cap,
        members: s.pact.memberAccounts,
        nonce: BigInt(s.pact.nonce),
      }),
      signatures: s.pact.signatures as { buyer: BuyerId; signer: string; signatureB64: string }[],
    };
  }
  let chain: unknown = null;
  if (s.seasonId !== null) chain = await deps.chain.getSeason(s.seasonId).catch(() => null);
  return {
    sessionId: id,
    seasonId: s.seasonId,
    contractId: s.contractId,
    playerAccountId: s.playerAccountId,
    model: deps.llm.model,
    ...(tee ? { tee } : {}),
    ...(s.mode ? { mode: s.mode } : {}),
    ...(deps.llm.attestation ? { attestation: await deps.llm.attestation().catch(() => undefined) } : {}),
    channel: s.channel,
    pact,
    receipts,
    txs,
    chain,
    status: statusOf(s, false),
  };
}
