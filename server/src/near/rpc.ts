import { AppError } from '../errors.js';
import { debug } from '../log.js';

// drpc.org does not serve send_tx ("method is not available"): rpc.testnet.fastnear.com does, so it comes first.
export const DEFAULT_RPC_URLS = ['https://rpc.testnet.near.org', 'https://rpc.testnet.fastnear.com', 'https://near-testnet.drpc.org', 'https://test.rpc.fastnear.com'];

export class RpcError extends Error {
  constructor(
    message: string,
    readonly name_: string,
    readonly raw: unknown,
  ) {
    super(message);
  }
}

export interface RpcOptions {
  urls: string[];
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** JSON-RPC client with ordered failover across providers. */
export class Rpc {
  private urls: string[];
  private fetchFn: typeof fetch;
  private timeoutMs: number;
  private preferred = 0;
  private id = 0;

  constructor(opts: RpcOptions) {
    if (opts.urls.length === 0) throw new Error('at least one RPC url required');
    this.urls = opts.urls;
    this.fetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 15000;
  }

  async call<T = any>(method: string, params: unknown): Promise<T> {
    let lastErr: unknown = null;
    for (let i = 0; i < this.urls.length; i++) {
      const idx = (this.preferred + i) % this.urls.length;
      const url = this.urls[idx]!;
      try {
        const out = await this.callOne<T>(url, method, params);
        this.preferred = idx;
        return out;
      } catch (e) {
        if (e instanceof RpcError) throw e; // a definitive answer from the node: do not fail over
        lastErr = e;
        debug('rpc', 'failover from', url, String(e));
      }
    }
    throw new AppError('RPC_UNAVAILABLE', `RPC failed on all providers: ${String(lastErr)}`);
  }

  private async callOne<T>(url: string, method: string, params: unknown): Promise<T> {
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
    if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error('non-JSON RPC response');
    }
    if (json.error) {
      const cause = json.error.cause?.name ?? json.error.name ?? 'UNKNOWN';
      // Free-tier providers answer HTTP 200 with a JSON-RPC rate-limit error: treat it like an outage.
      if (json.error.code === -429 || /rate limit/i.test(String(json.error.message))) throw new Error('rate limited');
      // A provider that does not serve this method at all (e.g. send_tx on drpc) is not an answer about the tx: fail over.
      if (json.error.code === -32601 || /method is not available|method not found/i.test(String(json.error.message))) throw new Error('method unsupported');
      // Transient node-side conditions: try the next provider.
      if (['TIMEOUT_ERROR', 'INTERNAL_ERROR', 'UNAVAILABLE_SHARD', 'NOT_SYNCED_YET'].includes(cause)) {
        throw new Error(`transient ${cause}`);
      }
      throw new RpcError(
        json.error.data ? String(JSON.stringify(json.error.data)).slice(0, 500) : String(json.error.message),
        cause,
        json.error,
      );
    }
    return json.result as T;
  }
}
