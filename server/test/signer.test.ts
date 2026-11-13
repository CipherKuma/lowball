import { describe, expect, it } from 'vitest';
import { AppError, extractContractCode } from '../src/errors.js';
import { b58decode, b58encode } from '../src/near/base58.js';
import { generateKeyPair, formatSecretKey, parseSecretKey } from '../src/near/keys.js';
import { Rpc } from '../src/near/rpc.js';
import { enqueue, NearSigner, parseOutcome } from '../src/near/signer.js';

describe('base58 / keys', () => {
  it('round-trips bytes including leading zeros', () => {
    for (const hex of ['00', '0000ff', 'ff00', '000102030405060708']) {
      const b = Uint8Array.from(hex.match(/../g)!.map((x) => parseInt(x, 16)));
      expect(Array.from(b58decode(b58encode(b)))).toEqual(Array.from(b));
    }
  });
  it('round-trips ed25519 secret keys', () => {
    const kp = generateKeyPair();
    expect(parseSecretKey(formatSecretKey(kp)).publicKey).toEqual(kp.publicKey);
  });
});

describe('nonce queue', () => {
  it('runs jobs for one key strictly one at a time, in order', async () => {
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const job = (name: string, ms: number) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      order.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`end ${name}`);
      running--;
      return name;
    };
    const out = await Promise.all([enqueue('k', job('a', 30)), enqueue('k', job('b', 5)), enqueue('k', job('c', 1))]);
    expect(out).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('runs different keys in parallel', async () => {
    let running = 0;
    let maxRunning = 0;
    const job = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
    };
    await Promise.all(['x1', 'x2', 'x3'].map((k) => enqueue(k, job)));
    expect(maxRunning).toBe(3);
  });

  it('a failing job does not block the queue', async () => {
    const bad = enqueue('f', async () => {
      throw new Error('boom');
    });
    const good = enqueue('f', async () => 'ok');
    await expect(bad).rejects.toThrow('boom');
    await expect(good).resolves.toBe('ok');
  });
});

/** Fake JSON-RPC node recording calls. */
function fakeNode(handlers: Record<string, (params: any, n: number) => unknown>) {
  const calls: { method: string; params: any }[] = [];
  const fetchFn = (async (_url: string, init: any) => {
    const { method, params, id } = JSON.parse(init.body);
    calls.push({ method, params });
    const n = calls.filter((c) => c.method === method).length;
    const h = handlers[method];
    if (!h) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_TRANSACTION' }, message: 'nope' } }));
    const r: any = h(params, n);
    if (r instanceof Response) return r;
    if (r && r.__error) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: r.__error }));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: r }));
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const OK_OUTCOME = { final_execution_outcome: { status: { SuccessValue: '' }, transaction_outcome: { outcome: { status: { SuccessValue: '' } } }, receipts_outcome: [] } };

describe('NearSigner retries', () => {
  const kp = generateKeyPair();
  const mk = (node: ReturnType<typeof fakeNode>, id: string) =>
    new NearSigner({ accountId: id, keyPair: kp, rpc: new Rpc({ urls: ['http://a'], fetchFn: node.fetchFn }) });
  const base = {
    query: () => ({ nonce: 10 }),
    block: () => ({ header: { hash: b58encode(new Uint8Array(32).fill(7)) } }),
  };

  it('retries once on InvalidNonce using the node-reported ak_nonce', async () => {
    const node = fakeNode({
      ...base,
      send_tx: (_p, n) =>
        n === 1
          ? { __error: { name: 'HANDLER_ERROR', cause: { name: 'INVALID_TRANSACTION' }, data: { TxExecutionError: { InvalidTxError: { InvalidNonce: { tx_nonce: 11, ak_nonce: 50 } } } } } }
          : OK_OUTCOME,
    });
    const r = await mk(node, 'invalidnonce.testnet').send('c.testnet', [{ kind: 'createAccount' }]);
    expect(r.ok).toBe(true);
    expect(node.calls.filter((c) => c.method === 'send_tx')).toHaveLength(2);
  });

  it('after a timeout looks the tx hash up and does NOT resubmit a tx that already landed', async () => {
    const node = fakeNode({
      ...base,
      send_tx: () => new Response('gateway timeout', { status: 504 }),
      tx: () => OK_OUTCOME,
    });
    const r = await mk(node, 'idem.testnet').send('c.testnet', [{ kind: 'createAccount' }]);
    expect(r.ok).toBe(true);
    // two providers would be tried per call; with one provider each send_tx is a single attempt
    expect(node.calls.filter((c) => c.method === 'send_tx').length).toBe(1);
  });

  it('fails over to a second RPC provider when the first is down', async () => {
    const hits: string[] = [];
    const fetchFn = (async (url: string, init: any) => {
      hits.push(url);
      if (url.includes('down')) throw new Error('ECONNRESET');
      const { id } = JSON.parse(init.body);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { ok: true } }));
    }) as unknown as typeof fetch;
    const rpc = new Rpc({ urls: ['http://down', 'http://up'], fetchFn });
    await expect(rpc.call('status', [])).resolves.toEqual({ ok: true });
    await rpc.call('status', []);
    expect(hits).toEqual(['http://down', 'http://up', 'http://up']); // sticks to the healthy one
  });

  it('treats a JSON-RPC rate-limit error (HTTP 200, code -429) as an outage and fails over', async () => {
    const fetchFn = (async (url: string, init: any) => {
      const { id } = JSON.parse(init.body);
      if (url.includes('limited')) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -429, message: 'Rate limits exceeded' } }));
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: 'fine' }));
    }) as unknown as typeof fetch;
    const rpc = new Rpc({ urls: ['http://limited', 'http://ok'], fetchFn });
    await expect(rpc.call('status', [])).resolves.toBe('fine');
  });

  it('RPC_UNAVAILABLE when every provider fails', async () => {
    const fetchFn = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    const rpc = new Rpc({ urls: ['http://a', 'http://b'], fetchFn });
    await expect(rpc.call('status', [])).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
  });
});

describe('outcome parsing', () => {
  it('maps a contract panic inside a receipt to its stable code', () => {
    const res = {
      final_execution_outcome: {
        status: { Failure: {} },
        transaction_outcome: { outcome: { status: { SuccessReceiptId: 'x' } } },
        receipts_outcome: [
          { outcome: { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: E_ALREADY_CONFESSED' } } } } } } },
        ],
      },
    };
    const r = parseOutcome('h', res);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('E_ALREADY_CONFESSED');
  });
  it('unknown failures become TX_FAILED, not a raw error string', () => {
    const r = parseOutcome('h', { final_execution_outcome: { status: { Failure: { ActionError: { kind: 'AccountDoesNotExist' } } }, receipts_outcome: [] } });
    expect(r.errorCode).toBe('TX_FAILED');
  });
  it('a failed tx for lack of balance maps to TREASURY_LOW', () => {
    const r = parseOutcome('h', { final_execution_outcome: { status: { Failure: { ActionError: { kind: { LackBalanceForState: { account_id: 'x', amount: '1' } } } } }, receipts_outcome: [] } });
    expect(r.errorCode).toBe('TREASURY_LOW');
  });
  it('extractContractCode ignores non-contract E_ strings', () => {
    expect(extractContractCode('E_NOT_A_CODE')).toBeNull();
    expect(extractContractCode('panicked: E_BAD_SIG at x')).toBe('E_BAD_SIG');
    expect(new AppError('E_BAD_SIG').status).toBe(400);
  });
});
