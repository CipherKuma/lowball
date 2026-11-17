import { BUYER_IDS, type SeasonMode } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import type { GameCtx } from '../game/ctx.js';
import { debug } from '../log.js';
import { toB64 } from '../near/bytes.js';
import type { TeeJobRow } from '../store/types.js';

/** Health rules for TEE_MODE=auto (the integrator's thresholds). */
export const HEALTH = {
  window: 10,
  minSuccessRate: 0.8,
  recentMs: 30 * 60_000,
  maxP90Ms: 75_000,
  probeCapMs: 60_000,
  lockName: 'tee-mode',
  lockTtlMs: 150_000,
  lockWaitMs: 100_000,
} as const;

/** The jobs health is judged by: the pact path only (a live sign_pact, or the synthetic one the probe runs). The old `probe` op and confession jobs never count. */
export const PACT_OPS: readonly string[] = ['sign_pact', 'probe_pact'];

export type Health =
  | { state: 'healthy'; detail: string }
  | { state: 'unhealthy'; detail: string }
  /** no pact job in the last 30 minutes (or none ever): nothing to judge by, so a drill pact (probe_pact) decides */
  | { state: 'unknown'; detail: string };

function p90(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)]!;
}

/** Pure: judge enclave health from the newest-first job attempts. */
export function assessHealth(all: TeeJobRow[], now: number): Health {
  const jobs = all.filter((j) => PACT_OPS.includes(j.op)).slice(0, HEALTH.window);
  if (jobs.length === 0) return { state: 'unknown', detail: 'no pact jobs recorded yet' };
  if (now - jobs[0]!.at > HEALTH.recentMs) return { state: 'unknown', detail: 'no pact job in the last 30 minutes' };
  const ok = jobs.filter((j) => j.ok);
  const rate = ok.length / jobs.length;
  const pct = `${ok.length} of the last ${jobs.length} enclave jobs succeeded`;
  if (rate < HEALTH.minSuccessRate) return { state: 'unhealthy', detail: pct };
  if (!ok.some((j) => now - j.at <= HEALTH.recentMs)) return { state: 'unhealthy', detail: `${pct}, none in the last 30 minutes` };
  const slow = p90(ok.map((j) => j.ms));
  if (slow >= HEALTH.maxP90Ms) return { state: 'unhealthy', detail: `${pct}, but p90 latency was ${Math.round(slow / 1000)} s` };
  return { state: 'healthy', detail: `${pct}, p90 latency ${Math.round(slow / 1000)} s` };
}

/** Run fn while holding the cross-session mode lock; waits for another session's turn (up to ~100 s). */
export async function withModeLock<T>(ctx: GameCtx, fn: () => Promise<T>): Promise<T> {
  const { store } = ctx.deps;
  const sleep = (ms: number) => ctx.sleep(ms);
  const t0 = Date.now();
  let got = false;
  while (!(got = await store.tryGlobalLock(HEALTH.lockName, HEALTH.lockTtlMs))) {
    if (Date.now() - t0 > HEALTH.lockWaitMs) throw new AppError('BUSY', 'Another season is still being set up. Try again in a moment.');
    await sleep(400);
  }
  try {
    return await fn();
  } finally {
    await store.releaseGlobalLock(HEALTH.lockName).catch(() => undefined);
  }
}

/** The key each buyer's account must have registered for a mode (base64, 32 bytes). */
function wantedKey(ctx: GameCtx, mode: SeasonMode, id: (typeof BUYER_IDS)[number]): string {
  return mode === 'enclave' ? ctx.deps.tee!.deployment.buyers[id].publicKeyB64 : toB64(ctx.deps.pactKeys[id].publicKey);
}

/**
 * Make every buyer's registered key match the mode, calling register_buyer_key from the buyer's own account only
 * where get_buyer_key differs (parallel across buyers), and read each one back. Throws if a key did not take.
 */
export async function ensureKeys(ctx: GameCtx, mode: SeasonMode): Promise<number> {
  const { chain } = ctx.deps;
  let changed = 0;
  const results = await Promise.allSettled(
    BUYER_IDS.map(async (id) => {
      const account = ctx.state.buyers.find((b) => b.id === id)!.accountId;
      const want = wantedKey(ctx, mode, id);
      if ((await chain.getBuyerKey(account)) === want) return;
      await ctx.must(`register_buyer_key ${id} (${mode})`, account, chain.registerBuyerKey(id, want));
      // a view can come from a node that has not seen the block yet: read back a few times before calling it failed
      let seen = await chain.getBuyerKey(account).catch(() => null);
      for (let i = 0; i < 6 && seen !== want; i++) {
        await ctx.sleep(1000);
        seen = await chain.getBuyerKey(account).catch(() => null);
      }
      if (seen !== want) throw new AppError('TX_FAILED', `${id}'s key did not register`);
      changed++;
    }),
  );
  const bad = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (bad) throw bad.reason instanceof AppError ? bad.reason : new AppError('TX_FAILED', 'could not register a buyer key');
  return changed;
}

function hasEnclaveKeys(ctx: GameCtx): boolean {
  return !!ctx.deps.tee && BUYER_IDS.every((id) => ctx.deps.tee!.deployment.buyers[id]?.publicKeyB64);
}

/** Pick enclave or standard for this season. Does not touch the chain. */
export async function chooseMode(ctx: GameCtx): Promise<{ mode: SeasonMode; reason: string }> {
  const configured = ctx.deps.teeMode ?? (ctx.deps.tee ? 'on' : 'off');
  if (configured === 'off') return { mode: 'standard', reason: 'Enclave signing is switched off.' };
  if (!hasEnclaveKeys(ctx)) return { mode: 'standard', reason: 'No enclave keys are deployed.' };
  if (configured === 'on') return { mode: 'enclave', reason: 'Enclave signing is switched on.' };
  let jobs: TeeJobRow[] = [];
  try {
    jobs = await ctx.deps.store.recentTeeJobs(HEALTH.window * 6);
  } catch (e) {
    debug('tee', 'health read failed', String(e).slice(0, 120));
  }
  const h = assessHealth(jobs, Date.now());
  if (h.state === 'healthy') return { mode: 'enclave', reason: `The enclaves look healthy: ${h.detail}.` };
  if (h.state === 'unhealthy') return { mode: 'standard', reason: `The enclaves look unhealthy: ${h.detail}.` };
  const probe = await ctx.deps.tee!.probe(ctx, 'marlow', HEALTH.probeCapMs);
  if (probe.ok) return { mode: 'enclave', reason: `${h.detail}; a drill pact was signed in ${Math.round(probe.ms / 1000)} s.` };
  return { mode: 'standard', reason: `${h.detail}; ${probe.reason}.` };
}

/** How this session signs: the enclave client only while the season is in enclave mode. */
export function teeFor(ctx: GameCtx) {
  return ctx.state.mode === 'enclave' ? ctx.deps.tee : undefined;
}
