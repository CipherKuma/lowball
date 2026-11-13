import { AppError, extractContractCode } from '../errors.js';
import { debug } from '../log.js';
import type { ErrorCode } from '../../../shared/api.js';
import type { KeyPair } from './keys.js';
import { Rpc, RpcError } from './rpc.js';
import { signTransaction, type Action } from './tx.js';
import { formatPublicKey } from './keys.js';

export interface TxResult {
  hash: string;
  ok: boolean;
  errorCode?: ErrorCode;
  failure?: string;
  /** base64 SuccessValue of the first receipt when ok */
  returnValue?: string;
}

/** Walk a final execution outcome and report the first failure, if any. */
export function parseOutcome(hash: string, res: any): TxResult {
  const failures: string[] = [];
  const top = res?.final_execution_outcome ?? res;
  const collect = (st: any) => {
    if (st && typeof st === 'object' && 'Failure' in st) failures.push(JSON.stringify(st.Failure));
  };
  collect(top?.transaction_outcome?.outcome?.status);
  for (const r of top?.receipts_outcome ?? []) collect(r?.outcome?.status);
  collect(top?.status);
  if (failures.length > 0) {
    const text = failures[0]!;
    const code = extractContractCode(text);
    const broke = /NotEnoughBalance|LackBalanceForState|NotEnoughAllowance/.test(text);
    return { hash, ok: false, errorCode: code ?? (broke ? 'TREASURY_LOW' : 'TX_FAILED'), failure: text.slice(0, 400) };
  }
  const sv = top?.status?.SuccessValue;
  return { hash, ok: true, returnValue: typeof sv === 'string' ? sv : undefined };
}

const queues = new Map<string, Promise<unknown>>();

/** Serialise async work per key (one signer = one in-flight tx, so nonces stay ordered). */
export function enqueue<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const run = prev.then(job, job);
  const tail = run.catch(() => undefined);
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

export interface SignerOptions {
  accountId: string;
  keyPair: KeyPair;
  rpc: Rpc;
  maxAttempts?: number;
}

const lastNonce = new Map<string, bigint>();
let blockCache: { hash: string; at: number } | null = null;

export class NearSigner {
  readonly accountId: string;
  private kp: KeyPair;
  private rpc: Rpc;
  private maxAttempts: number;

  constructor(o: SignerOptions) {
    this.accountId = o.accountId;
    this.kp = o.keyPair;
    this.rpc = o.rpc;
    this.maxAttempts = o.maxAttempts ?? 5;
  }

  get publicKey(): string {
    return formatPublicKey(this.kp.publicKey);
  }

  /** Sign and submit; never double-submits: a timeout is resolved by looking the tx hash up first. */
  send(receiverId: string, actions: Action[]): Promise<TxResult> {
    const key = `${this.accountId}#${this.publicKey}`;
    return enqueue(key, () => this.sendNow(key, receiverId, actions));
  }

  private async blockHash(force = false): Promise<string> {
    if (!force && blockCache && Date.now() - blockCache.at < 30_000) return blockCache.hash;
    const b = await this.rpc.call('block', { finality: 'final' });
    blockCache = { hash: b.header.hash, at: Date.now() };
    return blockCache.hash;
  }

  private async chainNonce(): Promise<bigint> {
    const ak = await this.rpc.call('query', {
      request_type: 'view_access_key',
      finality: 'optimistic',
      account_id: this.accountId,
      public_key: this.publicKey,
    });
    return BigInt(ak.nonce);
  }

  private async sendNow(key: string, receiverId: string, actions: Action[]): Promise<TxResult> {
    let nonceFloor: bigint | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let nonce = (await this.chainNonce()) + 1n;
      const local = (lastNonce.get(key) ?? 0n) + 1n;
      if (local > nonce) nonce = local;
      if (nonceFloor !== null && nonceFloor > nonce) nonce = nonceFloor;
      const signed = signTransaction(
        { signerId: this.accountId, receiverId, nonce, blockHash: await this.blockHash(attempt > 2), actions },
        this.kp,
      );
      try {
        const res = await this.submit(signed.base64);
        lastNonce.set(key, nonce);
        return parseOutcome(signed.hash, res);
      } catch (e) {
        const known = await this.lookup(signed.hash);
        if (known) {
          lastNonce.set(key, nonce);
          return known; // it actually landed: do not resubmit
        }
        if (e instanceof RpcError) {
          const text = e.message + JSON.stringify(e.raw);
          const m = /InvalidNonce[^}]*?ak_nonce\D+(\d+)/.exec(text);
          if (m) {
            nonceFloor = BigInt(m[1]!) + 1n;
            debug('signer', 'InvalidNonce, retrying with', String(nonceFloor));
            continue;
          }
          if (/Expired|InvalidTransaction.*block/i.test(text)) {
            blockCache = null;
            continue;
          }
          throw new AppError('TX_FAILED', `transaction rejected: ${e.name_}`);
        }
        if (attempt === this.maxAttempts) throw e;
      }
    }
    throw new AppError('TX_FAILED', 'transaction not accepted after retries');
  }

  private async submit(base64: string): Promise<any> {
    return this.rpc.call('send_tx', { signed_tx_base64: base64, wait_until: 'EXECUTED_OPTIMISTIC' });
  }

  private async lookup(hash: string): Promise<TxResult | null> {
    try {
      const res = await this.rpc.call('tx', {
        tx_hash: hash,
        sender_account_id: this.accountId,
        wait_until: 'EXECUTED_OPTIMISTIC',
      });
      return parseOutcome(hash, res);
    } catch {
      return null;
    }
  }
}

export function newSalt(): Uint8Array {
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  return s;
}

