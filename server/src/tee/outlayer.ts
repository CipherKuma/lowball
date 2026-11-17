import type { BuyerId } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { debug } from '../log.js';
import { nearToYocto } from '../near/accounts.js';
import { utf8 } from '../near/bytes.js';
import { Rpc, RpcError } from '../near/rpc.js';
import type { NearSigner } from '../near/signer.js';
import type { TeeDeployment, TeeJobOptions, TeeRun, TeeTransport } from './types.js';

const TGAS = 10n ** 12n;
/**
 * Attached to request_execution; the contract refunds what the job does not use. It must cover the run (estimate for
 * 60 s: 0.0071 NEAR) AND the storage of the output, 1e19 yocto per output byte (a 2087-byte sign_pact output needs
 * 0.0209 NEAR). 0.0071 + 8 KB x 1e19 = 0.0890; rounded up to 0.09 NEAR. The 17 Nov failure was this: 0.0071 left
 * 0.0059 after the run, so OutLayer refused to store the output ("output_storage_unpaid") and the job read as null.
 */
export const DEFAULT_DEPOSIT_NEAR = '0.09';
export function depositYocto(near: string | undefined): bigint {
  try {
    const v = nearToYocto((near ?? '').trim() || DEFAULT_DEPOSIT_NEAR);
    return v > 0n ? v : nearToYocto(DEFAULT_DEPOSIT_NEAR);
  } catch {
    return nearToYocto(DEFAULT_DEPOSIT_NEAR);
  }
}
const GAS = 300n * TGAS;
const LIMITS = { max_instructions: 1_000_000_000, max_memory_mb: 128, max_execution_seconds: 60 };

export interface OutlayerOptions {
  deployment: TeeDeployment;
  /** the house signer: it is the only caller the enclave builds accept */
  signer: NearSigner;
  rpc: Rpc;
  sleep?: (ms: number) => Promise<void>;
  /** give up waiting for a job result after this long (default 100 s); the caller retries once */
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  /** attached to every request_execution (default 0.09 NEAR, see DEFAULT_DEPOSIT_NEAR); the unused part is refunded */
  depositYocto?: bigint;
}

/** The guest's output (null when it failed) and, when OutLayer logged why on the receipt, its own words. */
interface Result {
  output: unknown;
  error?: string;
}

/** OutLayer reports a failed execution in a receipt log, not in the transaction status: find it. */
export function executionFailure(res: any): string | undefined {
  const top = res?.final_execution_outcome ?? res;
  const outcomes: any[] = [...(top?.receipts_outcome ?? []), top?.transaction_outcome].filter(Boolean);
  for (const o of outcomes) {
    for (const line of (o?.outcome?.logs ?? []) as unknown[]) {
      const text = String(line);
      if (/Execution failed|output_storage_unpaid/.test(text)) return text.slice(0, 400);
    }
  }
  return undefined;
}

/**
 * Runs one OutLayer job: request_execution on outlayer.testnet signed by the house, then polls the transaction to
 * FINAL and reads the guest's output from its SuccessValue. Never uses broadcast_tx_commit: public RPCs time out
 * while the job still completes.
 */
export class OutlayerTransport implements TeeTransport {
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;
  constructor(private o: OutlayerOptions) {
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = o.now ?? Date.now;
  }

  /**
   * The whole job (send, wait, read) never takes longer than the cap: one RPC poll can itself spend a minute
   * failing over rate-limited providers, so the cap is a hard deadline, not just the loop's condition.
   */
  async run(buyer: BuyerId, input: Record<string, unknown>, opts: TeeJobOptions = {}): Promise<TeeRun> {
    const cap = opts.timeoutMs ?? this.o.timeoutMs ?? 100_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AppError('TEE_UNAVAILABLE', `The enclave job did not finish within ${Math.round(cap / 1000)} s.`)), cap + 1500);
    });
    try {
      return await Promise.race([this.runInner(buyer, input, { ...opts, timeoutMs: cap }), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async runInner(buyer: BuyerId, input: Record<string, unknown>, opts: TeeJobOptions): Promise<TeeRun> {
    const d = this.o.deployment;
    const b = d.buyers[buyer];
    const started = this.now();
    debug('tee', buyer, String(input.op), 'send start');
    const args = {
      source: { WasmUrl: { url: b.wasmUrl, hash: b.wasmSha256, build_target: 'wasm32-wasip2' } },
      resource_limits: LIMITS,
      input_data: JSON.stringify(input),
      secrets_ref: { profile: d.secretsProfile, account_id: d.secretsOwner },
      response_format: 'Json',
      payer_account_id: null,
      params: null,
    };
    const sent = await this.o.signer.send(
      d.outlayerContract,
      [{ kind: 'functionCall', method: 'request_execution', args: utf8(JSON.stringify(args)), gas: GAS, deposit: this.o.depositYocto ?? depositYocto(undefined) }],
      'NONE',
    );
    debug('tee', buyer, 'sent', sent.hash, `${this.now() - started} ms`, sent.ok ? 'ok' : String(sent.errorCode));
    if (!sent.ok) throw new AppError('TEE_UNAVAILABLE', `request_execution for ${buyer} failed: ${sent.errorCode ?? 'rejected'}`);
    const { output, error } = await this.result(sent.hash, started, opts.timeoutMs).catch((e) => {
      debug('tee', buyer, 'result failed', sent.hash, `${this.now() - started} ms`, String(e));
      throw e;
    });
    debug('tee', buyer, 'result', sent.hash, `${this.now() - started} ms`, output === null ? 'null' : 'ok', error ?? '');
    return { output, txHash: sent.hash, ms: this.now() - started, ...(error ? { error } : {}) };
  }

  private async result(txHash: string, started: number, capMs?: number): Promise<Result> {
    const timeout = capMs ?? this.o.timeoutMs ?? 100_000;
    const poll = this.o.pollMs ?? 4000;
    await this.sleep(poll);
    while (this.now() - started < timeout) {
      try {
        const res: any = await this.o.rpc.call('tx', {
          tx_hash: txHash,
          sender_account_id: this.o.signer.accountId,
          wait_until: 'FINAL',
        });
        const top = res?.final_execution_outcome ?? res;
        const st = top?.status;
        if (st && typeof st === 'object' && 'SuccessValue' in st) {
          const text = new TextDecoder().decode(Uint8Array.from(atob(st.SuccessValue as string), (c) => c.charCodeAt(0)));
          const output = text.trim() === '' ? null : JSON.parse(text);
          const error = output === null || output === undefined ? executionFailure(res) : undefined;
          return { output, ...(error ? { error } : {}) };
        }
        if (st && typeof st === 'object' && 'Failure' in st) {
          throw new AppError('TEE_UNAVAILABLE', `OutLayer job transaction failed: ${JSON.stringify(st.Failure).slice(0, 160)}`);
        }
      } catch (e) {
        if (e instanceof AppError && e.code === 'TEE_UNAVAILABLE') throw e;
        // not final yet (UNKNOWN_TRANSACTION / timeout) or every RPC rate limited: keep polling
        debug('tee', 'poll', e instanceof RpcError ? e.name_ : String(e));
      }
      await this.sleep(poll);
    }
    throw new AppError('TEE_UNAVAILABLE', 'The enclave job did not finish in time.');
  }
}
