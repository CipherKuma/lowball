import { debug } from '../log.js';
import { BUYER_IDS, type BuyerId, type Mood, type TeeActRecord } from '../../../shared/api.js';
import type { PactJson } from '../chain/types.js';
import { AppError } from '../errors.js';
import type { GameCtx } from '../game/ctx.js';
import { checkSignatureCrypto, sha256Hex, type SignaturePayload } from '../llm/verify.js';
import { fromB64, utf8 } from '../near/bytes.js';
import { verify } from '../near/keys.js';
import { confessionMessage, pactMessage } from '../near/pact.js';
import { z } from 'zod';
import { DeliberateOut, PactOut, type CommonOut } from './schemas.js';
import type { TeeDeployment, TeeRun, TeeTransport } from './types.js';

export interface PactVote {
  chatId: string;
  sign: boolean;
  say: string;
  mood: Mood;
  signatureB64: string | null;
}
export interface TeeDeliberation {
  confess: boolean;
  say: string;
  mood: Mood;
  reasoning: string;
  confessionSigB64: string | null;
}

/** the health probe's synthetic pact: a season id no real season reaches and a fixed nonce */
export const PROBE_SEASON_ID = Number.MAX_SAFE_INTEGER;
export const PROBE_NONCE = '4242424242';
export const PROBE_OP = 'probe_pact';

const MOODS: Mood[] = ['calm', 'tense', 'cracking', 'cold'];
const moodOf = (m: string): Mood => MOODS.find((x) => x === m) ?? 'calm';

function fail(msg: string): never {
  throw new AppError('TEE_UNAVAILABLE', msg);
}

/** Time one enclave job (both attempts together) may take, and how it is split. */
export const JOB_BUDGET_MS = 90_000;
export const FIRST_ATTEMPT_MS = 55_000;
export const MIN_RETRY_MS = 12_000;

export interface TeeStats {
  /** jobs started (retries counted once each) */
  jobs: number;
  /** attempts that failed or came back empty and were retried or given up on */
  failedAttempts: number;
  /** jobs that ended without a usable result after their retry */
  failedJobs: number;
  /** wall clock ms of every attempt that returned */
  latenciesMs: number[];
}

/** Calls the buyers' enclave jobs, checks everything they return against the registered keys, records the evidence. */
export class TeeActs {
  readonly stats: TeeStats = { jobs: 0, failedAttempts: 0, failedJobs: 0, latenciesMs: [] };

  constructor(
    readonly deployment: TeeDeployment,
    private transport: TeeTransport,
  ) {}

  /** Health signal for TEE_MODE=auto: one row per attempt. Never lets a store problem break a game. */
  private async record(ctx: GameCtx, buyer: BuyerId, op: string, ok: boolean, ms: number): Promise<void> {
    try {
      await ctx.deps.store.addTeeJob({ at: Date.now(), buyer, op, ok, ms });
    } catch (e) {
      debug('tee', 'job record failed', String(e).slice(0, 120));
    }
  }

  /** Why an attempt failed, kept on the session (kind 'tee_error', not part of the case file) so a failure is never a silent null. */
  private async recordFailure(ctx: GameCtx, buyer: BuyerId, op: string, why: string): Promise<void> {
    try {
      const at = Date.now();
      await ctx.deps.store.addArtifact(ctx.id, 'tee_error', `${at}:${buyer}:${op}`, { at, buyer, op, why: why.slice(0, 400) });
    } catch (e) {
      debug('tee', 'failure record failed', String(e).slice(0, 120));
    }
  }

  /**
   * One job with one retry: a transport error, a timeout, an empty result (a guest trap) or a guest error is tried
   * again once. The two attempts share one budget (JOB_BUDGET_MS, so a pact round ends in about 90 s): the first may
   * use FIRST_ATTEMPT_MS of it, the retry whatever is left (skipped when under MIN_RETRY_MS).
   */
  private async runJob(ctx: GameCtx, buyer: BuyerId, input: Record<string, unknown>): Promise<{ run: TeeRun; attempts: number }> {
    this.stats.jobs++;
    const op = String(input.op);
    const t00 = Date.now();
    let last: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = JOB_BUDGET_MS - (Date.now() - t00);
      if (attempt === 2 && left < MIN_RETRY_MS) break;
      const cap = attempt === 1 ? Math.min(FIRST_ATTEMPT_MS, left) : left;
      const t0 = Date.now();
      try {
        const run = await this.transport.run(buyer, input, { timeoutMs: cap });
        this.stats.latenciesMs.push(run.ms);
        const good = run.output !== null && run.output !== undefined && (run.output as { ok?: unknown }).ok !== false;
        await this.record(ctx, buyer, op, good, run.ms);
        if (good) return { run, attempts: attempt };
        const err = (run.output as { error?: unknown } | null)?.error;
        const why = typeof err === 'string' ? err.slice(0, 140) : (run.error ?? 'returned nothing');
        last = new AppError('TEE_UNAVAILABLE', `${buyer}'s enclave job failed: ${why}`);
        await this.recordFailure(ctx, buyer, op, why);
      } catch (e) {
        last = e;
        await this.record(ctx, buyer, op, false, Date.now() - t0);
        await this.recordFailure(ctx, buyer, op, e instanceof Error ? e.message : String(e));
        debug('tee', buyer, 'attempt', attempt, 'failed', String(e).slice(0, 160));
      }
      this.stats.failedAttempts++;
    }
    this.stats.failedJobs++;
    throw last instanceof AppError ? last : new AppError('TEE_UNAVAILABLE', String(last).slice(0, 160));
  }

  /**
   * The health probe: the real `sign_pact` op on a synthetic pact, so it travels the same path as a live pact (request,
   * enclave run, NEAR AI call, output storage, result read). The season id and nonce are fixed and can never be a real
   * season's (next_season_id counts up from 0), and the pact is never sent to the contract. ok only when the output
   * carries a signature that verifies, against the registered enclave key, over the exact pact message. Recorded as
   * op 'probe_pact', which with 'sign_pact' is all TEE_MODE=auto judges by.
   */
  async probe(ctx: GameCtx, buyer: BuyerId, capMs: number): Promise<{ ok: boolean; ms: number; reason: string }> {
    const dep = this.deployment.buyers[buyer];
    const t0 = Date.now();
    const mate = BUYER_IDS.find((b) => b !== buyer)!;
    const account = (id: BuyerId) => ctx.state.buyers.find((b) => b.id === id)!.accountId;
    const pact: PactJson = { season_id: PROBE_SEASON_ID, cap: 60, members: [account(buyer), account(mate)], nonce: PROBE_NONCE };
    const input = {
      op: 'sign_pact', season_id: PROBE_SEASON_ID, buyer_account: account(buyer), pact_json: pact,
      system: 'This is a connectivity drill by the harbour office, not a real season. Nothing is at stake.',
      user: 'Drill. A pact with a cap of 60 marks is put in front of you. Answer with "sign": true to sign it, and say "drill" in one short sentence.',
    };
    const fail = (reason: string, ms: number) => ({ ok: false, ms, reason: `probe failed: ${reason}`.slice(0, 200) });
    try {
      const run = await this.transport.run(buyer, input, { timeoutMs: capMs });
      const parsed = PactOut.safeParse(run.output);
      let reason = run.error ?? 'no usable output';
      let good = false;
      if (parsed.success) {
        const o = parsed.data;
        const msg = pactMessage({ seasonId: PROBE_SEASON_ID, cap: pact.cap, members: pact.members, nonce: BigInt(PROBE_NONCE) });
        good = o.buyer === buyer && o.public_key_b64 === dep.publicKeyB64 && o.signature !== null && verify(fromB64(o.signature), msg, fromB64(dep.publicKeyB64));
        reason = good ? 'ok' : o.signature === null ? `he declined the drill pact (${o.decision})` : 'the signature did not verify against the registered key';
      }
      await this.record(ctx, buyer, PROBE_OP, good, run.ms);
      if (!good) await this.recordFailure(ctx, buyer, PROBE_OP, reason);
      return good ? { ok: true, ms: run.ms, reason: 'a signed drill pact verified' } : fail(reason, run.ms);
    } catch (e) {
      const ms = Date.now() - t0;
      await this.record(ctx, buyer, PROBE_OP, false, ms);
      await this.recordFailure(ctx, buyer, PROBE_OP, e instanceof Error ? e.message : String(e));
      return fail(e instanceof AppError ? e.message : String(e), ms);
    }
  }

  private async checked<O extends CommonOut>(
    ctx: GameCtx,
    buyer: BuyerId,
    act: 'pact' | 'confession',
    schema: z.ZodType<O, z.ZodTypeDef, unknown>,
    input: Record<string, unknown>,
    expectedMessage: Uint8Array,
    sigOf: (o: O) => string | null,
    decided: (o: O) => boolean,
    decisionOf: (o: O) => string,
  ): Promise<O> {
    const dep = this.deployment.buyers[buyer];
    const { run, attempts } = await this.runJob(ctx, buyer, input);
    const parsed = schema.safeParse(run.output);
    if (!parsed.success) {
      const err = (run.output as { error?: unknown })?.error;
      fail(`${buyer}'s enclave job failed: ${typeof err === 'string' ? err.slice(0, 140) : 'unexpected output'}`);
    }
    const o = parsed.data;
    if (o.buyer !== buyer) fail(`${buyer}: enclave answered as ${o.buyer}`);
    if (o.public_key_b64 !== dep.publicKeyB64) fail(`${buyer}: enclave key is not the registered key`);
    const pub = fromB64(dep.publicKeyB64);
    const sig = sigOf(o);
    if (decided(o) !== (sig !== null)) fail(`${buyer}: decision and signature disagree`);
    if (sig !== null && !verify(fromB64(sig), expectedMessage, pub)) fail(`${buyer}: signature does not verify against the registered key`);
    const signedSha = sig === null ? '' : sha256Hex(expectedMessage);
    if (o.signed_message_sha256 !== signedSha) fail(`${buyer}: enclave signed a different message than expected`);
    // the enclave's own record of the decision, signed with the same key
    const parts = o.receipt.message.split('|');
    const nearai = o.nearai;
    if (
      !verify(fromB64(o.receipt.signature), utf8(o.receipt.message), pub) ||
      parts[3] !== decisionOf(o) ||
      parts[5] !== nearai.request_sha256 ||
      parts[6] !== nearai.response_sha256 ||
      parts[7] !== nearai.chat_id
    ) {
      fail(`${buyer}: enclave receipt does not verify`);
    }
    const payload = nearai.signature as SignaturePayload | null;
    const textMatches = payload ? payload.text === `${nearai.model}:${nearai.request_sha256}:${nearai.response_sha256}` : null;
    const signatureValid = payload ? checkSignatureCrypto(payload) : null;
    const jobId = String(o.run.request_id ?? '');
    const attestationUrl = `${this.deployment.attestationBase}/attestations/by-tx/${run.txHash}`;
    const rec: TeeActRecord = {
      buyer,
      act,
      decision: decisionOf(o),
      jobId,
      txHash: run.txHash,
      attestationUrl,
      wasmSha256: dep.wasmSha256,
      publicKeyB64: dep.publicKeyB64,
      signatureB64: sig,
      receipt: o.receipt,
      nearAi: {
        chatId: nearai.chat_id,
        requestSha256: nearai.request_sha256,
        responseSha256: nearai.response_sha256,
        signatureKind: payload?.signature_kind ?? null,
        signingAddress: payload?.signing_address ?? null,
        textMatches,
        signatureValid,
      },
      signatureVerified: true,
      ms: run.ms,
      attempts,
      at: Date.now(),
    };
    await ctx.deps.store.addArtifact(ctx.id, 'tee', `${rec.at}:${buyer}:${act}`, rec);
    await ctx.emit({
      type: 'tee_signed',
      buyer,
      jobId,
      attestationUrl,
      act,
      decision: rec.decision,
      tx: run.txHash,
      wasmSha256: dep.wasmSha256,
    });
    return parsed.data;
  }

  /** Round 2 of the cartel: the enclave decides sign yes/no on this exact pact and signs it only on yes. */
  async signPact(ctx: GameCtx, buyer: BuyerId, a: { seasonId: number; buyerAccount: string; pact: PactJson; system: string; user: string }): Promise<PactVote> {
    const pactMsg = pactMessage({ seasonId: a.pact.season_id, cap: a.pact.cap, members: a.pact.members, nonce: BigInt(a.pact.nonce) });
    const o = await this.checked(
      ctx, buyer, 'pact', PactOut,
      { op: 'sign_pact', season_id: a.seasonId, buyer_account: a.buyerAccount, pact_json: a.pact, system: a.system, user: a.user },
      pactMsg, (x) => x.signature, (x) => x.decision === 'sign', (x) => x.decision,
    );
    if (o.decision !== 'sign' && o.decision !== 'refuse') fail(`${buyer}: unknown pact decision`);
    return { chatId: o.nearai.chat_id, sign: o.decision === 'sign', say: o.say, mood: moodOf(o.mood), signatureB64: o.signature };
  }

  /** Leniency window: the enclave decides confess yes/no and signs the confession only on yes. */
  async deliberate(
    ctx: GameCtx,
    buyer: BuyerId,
    a: { seasonId: number; buyerAccount: string; pact: PactJson; myPactSignature: string; system: string; user: string },
  ): Promise<TeeDeliberation> {
    const msg = confessionMessage(a.seasonId, a.buyerAccount, BigInt(a.pact.nonce));
    const o = await this.checked(
      ctx, buyer, 'confession', DeliberateOut,
      { op: 'deliberate', season_id: a.seasonId, buyer_account: a.buyerAccount, pact_json: a.pact, my_pact_signature: a.myPactSignature, system: a.system, user: a.user },
      msg, (x) => x.confession_sig, (x) => x.decision === 'confess', (x) => x.decision,
    );
    if (o.decision !== 'confess' && o.decision !== 'stay_quiet') fail(`${buyer}: unknown decision`);
    return { confess: o.decision === 'confess', say: o.say, mood: moodOf(o.mood), reasoning: o.reasoning ?? '', confessionSigB64: o.confession_sig };
  }
}
