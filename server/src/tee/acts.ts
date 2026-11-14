import { z } from 'zod';
import { debug } from '../log.js';
import type { BuyerId, Mood, TeeActRecord } from '../../../shared/api.js';
import type { PactJson } from '../chain/types.js';
import { AppError } from '../errors.js';
import type { GameCtx } from '../game/ctx.js';
import { checkSignatureCrypto, sha256Hex, type SignaturePayload } from '../llm/verify.js';
import { fromB64, utf8 } from '../near/bytes.js';
import { verify } from '../near/keys.js';
import { confessionMessage, pactMessage } from '../near/pact.js';
import type { TeeDeployment, TeeRun, TeeTransport } from './types.js';

const NearAiSig = z
  .object({ text: z.string(), signature: z.string(), signing_address: z.string(), signing_algo: z.string(), signature_kind: z.string().optional() })
  .nullable();

const Common = {
  ok: z.literal(true),
  buyer: z.string(),
  buyer_account: z.string(),
  season_id: z.number(),
  decision: z.string(),
  say: z.string(),
  mood: z.string(),
  public_key_b64: z.string(),
  pact_message_sha256: z.string(),
  signed_message_sha256: z.string(),
  nearai: z.object({
    model: z.string(),
    chat_id: z.string(),
    request_sha256: z.string(),
    response_sha256: z.string(),
    signature: NearAiSig,
  }),
  receipt: z.object({ message: z.string(), signature: z.string() }),
  run: z.object({ request_id: z.string().optional() }).passthrough(),
};
type CommonOut = z.infer<z.ZodObject<typeof Common>>;
const PactOut = z.object({ ...Common, op: z.literal('sign_pact'), signature: z.string().nullable() });
const DeliberateOut = z.object({ ...Common, op: z.literal('deliberate'), reasoning: z.string().nullable(), confession_sig: z.string().nullable() });

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

const MOODS: Mood[] = ['calm', 'tense', 'cracking', 'cold'];
const moodOf = (m: string): Mood => MOODS.find((x) => x === m) ?? 'calm';

function fail(msg: string): never {
  throw new AppError('TEE_UNAVAILABLE', msg);
}

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

  /** One job with one retry: a transport error, a timeout, an empty result (a guest trap) or a guest error is tried again once. */
  private async runJob(ctx: GameCtx, buyer: BuyerId, input: Record<string, unknown>): Promise<{ run: TeeRun; attempts: number }> {
    this.stats.jobs++;
    const op = String(input.op);
    let last: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      try {
        const run = await this.transport.run(buyer, input);
        this.stats.latenciesMs.push(run.ms);
        const good = run.output !== null && run.output !== undefined && (run.output as { ok?: unknown }).ok !== false;
        await this.record(ctx, buyer, op, good, run.ms);
        if (good) return { run, attempts: attempt };
        const err = (run.output as { error?: unknown } | null)?.error;
        last = new AppError('TEE_UNAVAILABLE', `${buyer}'s enclave job failed: ${typeof err === 'string' ? err.slice(0, 140) : 'returned nothing'}`);
      } catch (e) {
        last = e;
        await this.record(ctx, buyer, op, false, Date.now() - t0);
        debug('tee', buyer, 'attempt', attempt, 'failed', String(e).slice(0, 160));
      }
      this.stats.failedAttempts++;
    }
    this.stats.failedJobs++;
    throw last instanceof AppError ? last : new AppError('TEE_UNAVAILABLE', String(last).slice(0, 160));
  }

  /**
   * One quick `probe` job (the enclave derives its key, calls NEAR AI /models, signs a canary) with a hard cap.
   * ok only when it answered in time, as the registered build, with the API key sealed in. Recorded as a job.
   */
  async probe(ctx: GameCtx, buyer: BuyerId, capMs: number): Promise<{ ok: boolean; ms: number; reason: string }> {
    const dep = this.deployment.buyers[buyer];
    const t0 = Date.now();
    try {
      const run = await this.transport.run(buyer, { op: 'probe', nonce: `auto${t0}` }, { timeoutMs: capMs });
      const o = run.output as { ok?: unknown; public_key_b64?: unknown; has_api_key?: unknown } | null;
      const good = !!o && o.ok === true && o.public_key_b64 === dep.publicKeyB64 && o.has_api_key === true;
      await this.record(ctx, buyer, 'probe', good, run.ms);
      return { ok: good, ms: run.ms, reason: good ? 'probe answered' : 'probe answered with an unexpected result' };
    } catch (e) {
      const ms = Date.now() - t0;
      await this.record(ctx, buyer, 'probe', false, ms);
      return { ok: false, ms, reason: `probe failed: ${e instanceof AppError ? e.message : String(e)}`.slice(0, 160) };
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
