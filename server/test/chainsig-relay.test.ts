import { describe, expect, it } from 'vitest';
import fixture from './fixtures/chainsig-payout.json';
import { relayPayout, payoutEvmEvent } from '../src/chainsig/relay.js';
import { EvmRpc } from '../src/chainsig/evm.js';
import { ChainsigError, type DeskPayout } from '../src/chainsig/types.js';
import { Rpc } from '../src/near/rpc.js';
import { keccak } from '../src/chainsig/tx.js';
import { fromHex, toHex } from '../src/near/bytes.js';

const HASH = `0x${toHex(keccak(fromHex(fixture.signedRaw)))}`;
const DESK = 'desk.lowball-ck.testnet';
const signed = fixture.payout as DeskPayout;

interface World {
  payout: DeskPayout | null;
  balance: bigint;
  known: boolean;
  receipt: { status: string; blockNumber: string; gasUsed: string } | null;
  sendError?: { code: number; message: string };
  down: Set<string>;
  calls: Array<{ url: string; method: string }>;
  sent: string[];
  receiptAfterPolls: number;
}

function world(over: Partial<World> = {}): World {
  return { payout: signed, balance: 10n ** 16n, known: false, receipt: null, down: new Set(), calls: [], sent: [], receiptAfterPolls: 0, ...over };
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(w: World): typeof fetch {
  let polls = 0;
  return (async (input: any, init: any) => {
    const url = String(input);
    const body = JSON.parse(init.body);
    w.calls.push({ url, method: body.method });
    if (w.down.has(url)) return json({}, 503);
    const ok = (result: unknown) => json({ jsonrpc: '2.0', id: body.id, result });
    if (url.includes('near')) {
      const m = body.params.method_name;
      const res = m === 'get_payout' ? w.payout : m === 'get_derived_address' ? fixture.deskAddress : null;
      return ok({ result: Array.from(new TextEncoder().encode(JSON.stringify(res))), logs: [] });
    }
    switch (body.method) {
      case 'eth_getTransactionByHash':
        return ok(w.known ? { hash: HASH } : null);
      case 'eth_getBalance':
        return ok(`0x${w.balance.toString(16)}`);
      case 'eth_sendRawTransaction':
        w.sent.push(body.params[0]);
        if (w.sendError) {
          if (/already known/.test(w.sendError.message)) w.known = true; // a node really has it
          return json({ jsonrpc: '2.0', id: body.id, error: w.sendError });
        }
        w.known = true;
        return ok(HASH);
      case 'eth_getTransactionReceipt':
        return ok(w.known && ++polls > w.receiptAfterPolls ? (w.receipt ?? { status: '0x1', blockNumber: '0x6b2a10', gasUsed: '0x5208' }) : null);
    }
    return json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'method not found' } });
  }) as typeof fetch;
}

function deps(w: World, extra: Partial<Parameters<typeof relayPayout>[1]> = {}) {
  const f = fakeFetch(w);
  return {
    near: new Rpc({ urls: ['https://near-a.test', 'https://near-b.test'], fetchFn: f }),
    evm: new EvmRpc({ urls: ['https://sepolia-a.test', 'https://sepolia-b.test'], fetchFn: f }),
    deskId: DESK,
    sleep: async () => {},
    pollMs: 1,
    ...extra,
  };
}

describe('relayPayout', () => {
  it('broadcasts the assembled transaction and returns the receipt', async () => {
    const w = world();
    const r = await relayPayout(5, deps(w));
    expect(r).toEqual({ seasonId: 5, to: signed.to, amountWei: '200000000000000', sepoliaTx: HASH, status: 'success', blockNumber: 0x6b2a10, broadcast: true });
    expect(w.sent).toEqual([fixture.signedRaw]);
    expect(payoutEvmEvent(r, 'NEARTX')).toMatchObject({ kind: 'payout_evm', sepoliaTx: HASH, nearTx: 'NEARTX', amountWei: '200000000000000' });
  });

  it('is idempotent: an already-known transaction is not broadcast again', async () => {
    const w = world({ known: true });
    const r = await relayPayout(5, deps(w));
    expect(r.broadcast).toBe(false);
    expect(w.sent).toEqual([]);
  });

  it('fails over to the second Sepolia provider when the first is down', async () => {
    const w = world({ down: new Set(['https://sepolia-a.test']) });
    const r = await relayPayout(5, deps(w));
    expect(r.status).toBe('success');
    expect(w.calls.some((c) => c.url === 'https://sepolia-b.test' && c.method === 'eth_sendRawTransaction')).toBe(true);
  });

  it('throws EVM_UNAVAILABLE when every provider is down', async () => {
    const w = world({ down: new Set(['https://sepolia-a.test', 'https://sepolia-b.test']) });
    await expect(relayPayout(5, deps(w))).rejects.toMatchObject({ code: 'EVM_UNAVAILABLE' });
  });

  it('reports pending (with the real hash) when no receipt arrives in time', async () => {
    const w = world({ receiptAfterPolls: 10_000 });
    const r = await relayPayout(5, deps(w, { waitReceiptMs: 0 }));
    expect(r).toMatchObject({ status: 'pending', sepoliaTx: HASH });
  });

  it('reports a reverted receipt', async () => {
    const w = world({ receipt: { status: '0x0', blockNumber: '0x10', gasUsed: '0x5208' } });
    expect((await relayPayout(5, deps(w))).status).toBe('reverted');
  });

  it('refuses to broadcast from an underfunded desk address, with the numbers', async () => {
    const w = world({ balance: 1000n });
    await expect(relayPayout(5, deps(w))).rejects.toMatchObject({ code: 'UNDERFUNDED', message: expect.stringContaining('0x7d931fd3f5a12c18Cd77f9Cb90ff58E677dF9479') });
    expect(w.sent).toEqual([]);
  });

  it('maps node rejections: nonce too low, already known, other', async () => {
    await expect(relayPayout(5, deps(world({ sendError: { code: -32000, message: 'nonce too low: next nonce 9, tx nonce 7' } })))).rejects.toMatchObject({ code: 'NONCE_TOO_LOW' });
    const known = await relayPayout(5, deps(world({ sendError: { code: -32000, message: 'already known' } })));
    expect(known.sepoliaTx).toBe(HASH);
    await expect(relayPayout(5, deps(world({ sendError: { code: -32000, message: 'max fee per gas less than block base fee' } })))).rejects.toMatchObject({ code: 'EVM_REJECTED' });
  });

  it('waits for a Pending payout, gives up cleanly, and reports Failed / missing payouts', async () => {
    const pending = { ...signed, status: 'Pending' as const, big_r: null, s: null, recovery_id: null };
    const w = world({ payout: pending });
    await expect(relayPayout(5, deps(w, { waitSignedMs: 0 }))).rejects.toMatchObject({ code: 'PAYOUT_PENDING' });

    // becomes Signed on the third poll
    let n = 0;
    const w2 = world({ payout: pending });
    const d = deps(w2, { sleep: async () => { if (++n === 2) w2.payout = signed; }, waitSignedMs: 60_000 });
    expect((await relayPayout(5, d)).status).toBe('success');

    await expect(relayPayout(5, deps(world({ payout: { ...pending, status: 'Failed', error: 'E_SIGN_FAILED' } })))).rejects.toMatchObject({ code: 'PAYOUT_FAILED' });
    await expect(relayPayout(5, deps(world({ payout: null })))).rejects.toBeInstanceOf(ChainsigError);
    await expect(relayPayout(5, deps(world({ payout: null })))).rejects.toMatchObject({ code: 'NO_PAYOUT' });
  });

  it('refuses a payout whose signature is not from the desk address', async () => {
    const w = world();
    await expect(relayPayout(5, deps(w, { deskAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }))).rejects.toMatchObject({ code: 'SIG_MISMATCH' });
    expect(w.sent).toEqual([]);
  });
});
