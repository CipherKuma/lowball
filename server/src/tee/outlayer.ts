import type { BuyerId } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { debug } from '../log.js';
import { nearToYocto } from '../near/accounts.js';
import { utf8 } from '../near/bytes.js';
import { Rpc, RpcError } from '../near/rpc.js';
import type { NearSigner } from '../near/signer.js';
import type { TeeDeployment, TeeRun, TeeTransport } from './types.js';

const TGAS = 10n ** 12n;
/** attached to request_execution; the contract refunds what the job does not use (estimate for 60 s: 0.0070001 NEAR) */
const DEPOSIT = nearToYocto('0.0071');
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

  async run(buyer: BuyerId, input: Record<string, unknown>): Promise<TeeRun> {
    const d = this.o.deployment;
    const b = d.buyers[buyer];
    const started = this.now();
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
      [{ kind: 'functionCall', method: 'request_execution', args: utf8(JSON.stringify(args)), gas: GAS, deposit: DEPOSIT }],
      'INCLUDED',
    );
    if (!sent.ok) throw new AppError('TEE_UNAVAILABLE', `request_execution for ${buyer} failed: ${sent.errorCode ?? 'rejected'}`);
    const output = await this.result(sent.hash, started);
    return { output, txHash: sent.hash, ms: this.now() - started };
  }

  private async result(txHash: string, started: number): Promise<unknown> {
    const timeout = this.o.timeoutMs ?? 100_000;
    const poll = this.o.pollMs ?? 3000;
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
          return text.trim() === '' ? null : JSON.parse(text);
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
