// Sepolia JSON-RPC client with ordered failover across public providers. fetch only: Worker-safe.
import { ChainsigError } from './types.js';

export const DEFAULT_SEPOLIA_RPCS = ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org', 'https://1rpc.io/sepolia'];

/** A definitive JSON-RPC error from a node (do not fail over: every node would answer the same). */
export class EvmRpcError extends Error {
  constructor(
    message: string,
    readonly rpcCode: number,
  ) {
    super(message);
  }
}

export interface EvmRpcOptions {
  urls?: string[];
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface EvmReceipt {
  status: 'success' | 'reverted';
  blockNumber: number;
  gasUsed: bigint;
}

export class EvmRpc {
  private urls: string[];
  private fetchFn: typeof fetch;
  private timeoutMs: number;
  private preferred = 0;
  private id = 0;
  /** provider that answered the last successful call (for logs and the handback) */
  lastUrl = '';

  constructor(o: EvmRpcOptions = {}) {
    this.urls = o.urls?.length ? o.urls : DEFAULT_SEPOLIA_RPCS;
    this.fetchFn = o.fetchFn ?? ((...a) => fetch(...a));
    this.timeoutMs = o.timeoutMs ?? 12000;
  }

  async call<T = unknown>(method: string, params: unknown[]): Promise<T> {
    let last: unknown = null;
    for (let i = 0; i < this.urls.length; i++) {
      const idx = (this.preferred + i) % this.urls.length;
      try {
        const out = await this.callOne<T>(this.urls[idx]!, method, params);
        this.preferred = idx;
        this.lastUrl = this.urls[idx]!;
        return out;
      } catch (e) {
        if (e instanceof EvmRpcError) throw e;
        last = e;
      }
    }
    throw new ChainsigError('EVM_UNAVAILABLE', `Sepolia RPC failed on all ${this.urls.length} providers: ${String(last)}`);
  }

  private async callOne<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 500 || res.status === 429 || res.status === 403) throw new Error(`HTTP ${res.status}`);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error('non-JSON response');
    }
    if (json.error) {
      const msg = String(json.error.message ?? 'error');
      // Free providers report rate limits and plan limits as JSON-RPC errors: treat as an outage.
      if (json.error.code === 429 || json.error.code === -32005 || /rate limit|too many|capacity/i.test(msg)) throw new Error(msg);
      throw new EvmRpcError(msg, Number(json.error.code));
    }
    return json.result as T;
  }

  async getBalance(address: string): Promise<bigint> {
    return BigInt(await this.call<string>('eth_getBalance', [address, 'latest']));
  }

  async getNonce(address: string, tag: 'latest' | 'pending' = 'pending'): Promise<bigint> {
    return BigInt(await this.call<string>('eth_getTransactionCount', [address, tag]));
  }

  async chainId(): Promise<bigint> {
    return BigInt(await this.call<string>('eth_chainId', []));
  }

  async sendRaw(rawHex: string): Promise<string> {
    return this.call<string>('eth_sendRawTransaction', [rawHex]);
  }

  /** True once any node knows the transaction (pending or mined). */
  async isKnown(hash: string): Promise<boolean> {
    return (await this.call<unknown>('eth_getTransactionByHash', [hash])) !== null;
  }

  async getReceipt(hash: string): Promise<EvmReceipt | null> {
    const r = await this.call<{ status: string; blockNumber: string; gasUsed: string } | null>('eth_getTransactionReceipt', [hash]);
    if (!r) return null;
    return { status: r.status === '0x1' ? 'success' : 'reverted', blockNumber: Number(BigInt(r.blockNumber)), gasUsed: BigInt(r.gasUsed) };
  }

  /** Suggested EIP-1559 fees: 2x the pending base fee plus a 1.5 gwei tip (floor 1 gwei). */
  async suggestFees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    const block = await this.call<{ baseFeePerGas?: string }>('eth_getBlockByNumber', ['latest', false]);
    const base = BigInt(block.baseFeePerGas ?? '0x3b9aca00');
    const tip = 1_500_000_000n;
    return { maxFeePerGas: base * 2n + tip, maxPriorityFeePerGas: tip };
  }
}
