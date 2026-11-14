import { AppError } from '../errors.js';
import { debug } from '../log.js';
import type { AttestationSummary, Receipt } from '../../../shared/api.js';
import { utf8 } from '../near/bytes.js';
import type { CompleteRequest, CompleteResult, Llm } from './types.js';
import { summarizeEvidence, type AttestationEvidence } from './evidence.js';
import bundledEvidence from './attestation-evidence.json';
import { fetchPreflight, type Preflight } from './preflight.js';
import {
  failedVerification,
  sha256Hex,
  verifyReceipt,
  type SignaturePayload,
} from './verify.js';

export const DEFAULT_BASE_URL = 'https://cloud-api.near.ai/v1';
/** NEAR AI own-fleet Confidential TEE model (owned_by "nearai"), see server/MODELS.md. */
export const DEFAULT_MODEL = 'Qwen/Qwen3.6-35B-A3B-FP8';
const SIGNING_ALGO = 'ecdsa';

export interface NearAiOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** called once per completion HTTP response (also ones whose output is later rejected): the spend ledger */
  onUsage?: (u: UsageReport) => void | Promise<void>;
  /** hard cap on total completions (sim harness) */
  maxCalls?: number;
  /** attestation evidence record; undefined uses the bundled file, null means none */
  evidence?: AttestationEvidence | null;
  /** attestation nonce source (tests replay a recorded report with its recorded nonce) */
  nonceFn?: () => string;
}

/** Pull the first JSON object out of a model reply (tolerates code fences and prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]!.trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('no JSON object in reply');
}

export interface UsageReport {
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** true when the response carried no usage block and the counts are an upper-bound estimate from byte sizes */
  estimated: boolean;
}

export class NearAiLlm implements Llm {
  readonly model: string;
  private base: string;
  private key: string;
  private fetchFn: typeof fetch;
  private timeoutMs: number;
  private sleep: (ms: number) => Promise<void>;
  private preflight: { pf: Promise<Preflight>; at: number } | null = null;
  private evidence: AttestationEvidence | null;
  private nonceFn: (() => string) | undefined;
  private useSchema = true;
  calls = 0;
  private maxCalls: number;
  private onUsage: ((u: UsageReport) => void | Promise<void>) | undefined;

  constructor(o: NearAiOptions) {
    this.evidence = o.evidence === undefined ? (bundledEvidence as unknown as AttestationEvidence) : o.evidence;
    this.nonceFn = o.nonceFn;
    this.key = o.apiKey;
    this.model = o.model ?? DEFAULT_MODEL;
    this.base = (o.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchFn = o.fetchFn ?? ((...a) => fetch(...a));
    this.timeoutMs = o.timeoutMs ?? 25000;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxCalls = o.maxCalls ?? Infinity;
    this.onUsage = o.onUsage;
  }

  /** Report token usage to the ledger. Never throws: metering must not break a game step. */
  private async meter(j: any, requestBytes: number, responseBytes: number): Promise<void> {
    if (!this.onUsage) return;
    const pt = Number(j?.usage?.prompt_tokens);
    const ct = Number(j?.usage?.completion_tokens);
    const has = Number.isFinite(pt) && Number.isFinite(ct);
    // no usage block: assume one token per byte, a ceiling for English/JSON text
    const report: UsageReport = { model: this.model, promptTokens: has ? pt : requestBytes, completionTokens: has ? ct : responseBytes, estimated: !has };
    try {
      await this.onUsage(report);
    } catch (e) {
      debug('nearai', 'usage ledger failed', String(e));
    }
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.key}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'accept-encoding': 'identity',
      'x-no-aliasing': 'true',
    };
  }

  private async timedFetch(url: string, init: RequestInit): Promise<Response> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, { ...init, signal: ctl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  /** Gateway and model signer identities, fetched once before completions (cached 10 minutes). */
  getPreflight(): Promise<Preflight> {
    if (this.preflight && Date.now() - this.preflight.at < 600_000) return this.preflight.pf;
    // share one in-flight request between concurrent buyers
    const pf = fetchPreflight((u, i) => this.timedFetch(u, i), this.base, this.key, this.model, SIGNING_ALGO, this.nonceFn);
    this.preflight = { pf, at: Date.now() };
    return pf;
  }

  /** Case File summary: the last full verification run, matched against this deployment's live model signers. */
  async attestation(): Promise<AttestationSummary> {
    const pf = await this.getPreflight();
    return summarizeEvidence(this.evidence, this.model, pf.error ? null : { modelSigners: pf.models });
  }

  private buildBody<T>(req: CompleteRequest<T>): string {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      max_tokens: req.maxTokens ?? 1500,
      stream: false,
    };
    // Qwen3-family models think before answering by default; a buyer's decision is the structured answer,
    // and thinking made each call 10x slower (measured 2026-11-14), so it is switched off.
    if (/qwen3/i.test(this.model)) body.chat_template_kwargs = { enable_thinking: false };
    if (this.useSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
      };
    }
    return JSON.stringify(body);
  }

  async complete<T>(req: CompleteRequest<T>): Promise<CompleteResult<T>> {
    await this.getPreflight();
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (this.calls >= this.maxCalls) throw new AppError('MODEL_UNAVAILABLE', 'model call budget exhausted', { retryable: false });
      this.calls++;
      const requestBytes = utf8(this.buildBody(req));
      const sent = new TextDecoder().decode(requestBytes);
      let res: Response;
      let responseBytes: Uint8Array;
      try {
        res = await this.timedFetch(`${this.base}/chat/completions`, { method: 'POST', headers: this.headers(), body: sent });
        responseBytes = new Uint8Array(await res.arrayBuffer());
      } catch (e) {
        lastErr = e;
        debug('nearai', 'network error', String(e));
        continue;
      }
      if (!res.ok) {
        const txt = new TextDecoder().decode(responseBytes).slice(0, 300);
        debug('nearai', 'http', res.status, txt);
        if (res.status === 400 && this.useSchema && /response_format|json_schema|schema/i.test(txt)) {
          this.useSchema = false; // model rejects structured outputs: fall back to prompt-enforced JSON
          lastErr = new Error('schema unsupported');
          this.calls--;
          attempt--;
          continue;
        }
        lastErr = new Error(`HTTP ${res.status}`);
        if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) break;
        await this.sleep(600 * attempt);
        continue;
      }
      let chatId = '';
      let value: T;
      let raw: unknown;
      try {
        const j: any = JSON.parse(new TextDecoder().decode(responseBytes));
        await this.meter(j, requestBytes.length, responseBytes.length);
        chatId = String(j.id ?? '');
        const content: string = j.choices?.[0]?.message?.content ?? '';
        raw = extractJson(content);
        const parsed = req.schema.safeParse(raw);
        if (!parsed.success) throw new Error('schema mismatch: ' + parsed.error.issues[0]?.message);
        value = parsed.data;
      } catch (e) {
        lastErr = e;
        debug('nearai', 'bad output', String(e));
        continue; // one retry on invalid JSON
      }
      return { value, chatId, receipt: this.makeReceipt(req, chatId, requestBytes, responseBytes, value) };
    }
    const bad = lastErr instanceof Error && /schema mismatch|no JSON|JSON/.test(lastErr.message);
    throw new AppError(bad ? 'MODEL_BAD_OUTPUT' : 'MODEL_UNAVAILABLE', `model call failed for ${req.buyer}`);
  }

  private async fetchSignature(chatId: string): Promise<SignaturePayload | null> {
    for (let i = 0; i < 5; i++) {
      try {
        const res = await this.timedFetch(`${this.base}/signature/${encodeURIComponent(chatId)}?signing_algo=${SIGNING_ALGO}`, {
          headers: { accept: 'application/json', authorization: `Bearer ${this.key}` },
        });
        if (res.ok) {
          const j: any = await res.json();
          if (j?.text && j?.signature && j?.signing_address && j?.signing_algo) return j as SignaturePayload;
        } else if (res.status !== 404) {
          return null;
        }
      } catch {
        /* retry */
      }
      await this.sleep(700);
    }
    return null;
  }

  private async makeReceipt<T>(
    req: CompleteRequest<T>,
    chatId: string,
    requestBytes: Uint8Array,
    responseBytes: Uint8Array,
    output: unknown,
  ): Promise<Receipt> {
    const base = { chatId, kind: req.kind, buyer: req.buyer, day: req.day, model: this.model, output, createdAt: Date.now() };
    const reqHash = sha256Hex(requestBytes);
    const respHash = sha256Hex(responseBytes);
    try {
      const payload = chatId ? await this.fetchSignature(chatId) : null;
      if (!payload) {
        return { ...base, signature: null, verification: failedVerification(reqHash, respHash, 'signature unavailable') };
      }
      const pf = await this.getPreflight();
      const verification = verifyReceipt({
        requestBytes,
        responseBytes,
        modelId: this.model,
        payload,
        preflight: pf.gateway,
        modelSigners: pf.models,
        evidence: this.evidence,
      });
      return { ...base, signature: payload, verification };
    } catch (e) {
      return { ...base, signature: null, verification: failedVerification(reqHash, respHash, String(e).slice(0, 200)) };
    }
  }
}
