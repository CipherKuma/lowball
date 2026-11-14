// RealChain against a fake JSON-RPC node: request shapes for the upgraded contract and the yield-aware
// offer_leniency verification (inclusion, never execution).
import { describe, expect, it } from 'vitest';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { GAS_CONFESS, GAS_CONFESS_EVM, RealChain } from '../src/chain/real.js';
import type { BuyerKeys } from '../src/near/accounts.js';
import { toB64, utf8 } from '../src/near/bytes.js';
import { formatSecretKey, generateKeyPair } from '../src/near/keys.js';
import { Rpc } from '../src/near/rpc.js';
import { NearSigner } from '../src/near/signer.js';

const CONTRACT = 'lowball-ck.testnet';
const HOUSE = 'lowball-house-ck.testnet';
const PLAYER = 'pabc123.lowball-house-ck.testnet';

function fakeNode(handlers: Record<string, (params: any, n: number) => unknown>) {
  const calls: { method: string; params: any }[] = [];
  const fetchFn = (async (_url: string, init: any) => {
    const { method, params, id } = JSON.parse(init.body);
    calls.push({ method, params });
    const n = calls.filter((c) => c.method === method).length;
    const h = handlers[method];
    if (!h) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_TRANSACTION' }, message: 'nope' } }));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: h(params, n) }));
  }) as unknown as typeof fetch;
  return { calls, rpc: new Rpc({ urls: ['http://fake'], fetchFn }) };
}

function makeChain(rpc: Rpc) {
  const keys = {} as Record<BuyerId, BuyerKeys>;
  for (const id of BUYER_IDS) keys[id] = { near: generateKeyPair(), pact: generateKeyPair() };
  return new RealChain({ rpc, contractId: CONTRACT, houseId: HOUSE, houseKey: formatSecretKey(generateKeyPair()), buyerKeys: keys, pollMs: 1 });
}

/** replace a signer's send so the call is recorded instead of signed */
function spySend(chain: RealChain, who: 'house' | BuyerId) {
  const sent: { to: string; method: string; args: any; gas: bigint; deposit: bigint }[] = [];
  const target = who === 'house' ? (chain as any).house : (chain as any).buyers[who];
  target.send = async (to: string, actions: any[]) => {
    for (const a of actions) sent.push({ to, method: a.method, args: JSON.parse(new TextDecoder().decode(a.args)), gas: a.gas, deposit: a.deposit });
    return { hash: 'h', ok: true, returnValue: btoa('7') };
  };
  return sent;
}

describe('RealChain request shapes', () => {
  const chain = makeChain(fakeNode({}).rpc);
  const EVM = '0x' + '12'.repeat(20);

  it('create_season sends payout_evm only when one is given', async () => {
    const sent = spySend(chain, 'house');
    await chain.createSeason(PLAYER, ['a', 'b', 'c', 'd', 'e'], 6, 1n);
    await chain.createSeason(PLAYER, ['a', 'b', 'c', 'd', 'e'], 6, 1n, EVM);
    expect(sent[0]!.args).not.toHaveProperty('payout_evm');
    expect(sent[1]!.args.payout_evm).toBe(EVM);
    expect(sent[1]!.args).toMatchObject({ player: PLAYER, days: 6, bond: '1' });
  });

  it('open_lot sends the weight', async () => {
    const sent = spySend(chain, 'house');
    await chain.openLot(7, 'bluefin tuna', 260, 133);
    expect(sent[0]).toMatchObject({ method: 'open_lot', args: { season_id: 7, species: 'bluefin tuna', fair_value: 260, weight_kg: 133 } });
  });

  it('confess attaches 250 Tgas for a payout_evm season and 30 Tgas otherwise', async () => {
    const sent = spySend(chain, 'sully');
    const pact = { season_id: 7, cap: 50, members: ['a'], nonce: '1' };
    await chain.confess('sully', 7, pact, []);
    await chain.confess('sully', 7, pact, [], { payoutEvm: false });
    await chain.confess('sully', 7, pact, [], { payoutEvm: true });
    expect(sent.map((s) => s.gas)).toEqual([GAS_CONFESS, GAS_CONFESS, GAS_CONFESS_EVM]);
    expect(GAS_CONFESS).toBe(30n * 10n ** 12n);
    expect(GAS_CONFESS_EVM).toBe(250n * 10n ** 12n);
  });

  it('blockHeight reads the optimistic head', async () => {
    const node = fakeNode({ block: (p) => ({ header: { height: p.finality === 'optimistic' ? 123456 : 1, hash: 'x' } }) });
    expect(await makeChain(node.rpc).blockHeight()).toBe(123456);
  });
});

describe('NearSigner wait mode', () => {
  it("send(..., 'INCLUDED') asks the node to wait for inclusion only, never execution", async () => {
    const node = fakeNode({
      query: () => ({ nonce: 5, block_hash: 'x' }),
      block: () => ({ header: { hash: '11111111111111111111111111111111' } }),
      send_tx: () => ({ final_execution_status: 'INCLUDED', transaction: { hash: 'h' } }),
    });
    const signer = new NearSigner({ accountId: PLAYER, keyPair: generateKeyPair(), rpc: node.rpc });
    const r = await signer.send(CONTRACT, [{ kind: 'functionCall', method: 'offer_leniency', args: utf8('{"season_id":1}'), gas: 30n, deposit: 0n }], 'INCLUDED');
    expect(r.ok).toBe(true);
    const sends = node.calls.filter((c) => c.method === 'send_tx');
    expect(sends).toHaveLength(1);
    expect(sends[0]!.params.wait_until).toBe('INCLUDED');
  });
});

describe('verifyLeniencyTx (offer_leniency is a pending yield)', () => {
  const offerTx = (over: Record<string, unknown> = {}) => ({
    final_execution_status: 'INCLUDED',
    transaction: {
      signer_id: PLAYER,
      receiver_id: CONTRACT,
      actions: [{ FunctionCall: { method_name: 'offer_leniency', args: toB64(utf8(JSON.stringify({ season_id: 7 }))) } }],
      ...over,
    },
  });
  const view = (v: object) => ({ result: Array.from(utf8(JSON.stringify(v))) });
  const open = { leniency_open: true, leniency_open_block: 5000, leniency_deadline_block: 5200 };

  it('waits for INCLUSION (never EXECUTED), then reads the window from get_season', async () => {
    const node = fakeNode({ tx: () => offerTx(), query: () => view(open) });
    const r = await makeChain(node.rpc).verifyLeniencyTx('H'.repeat(44), PLAYER, 7);
    expect(r).toEqual({ ok: true, openBlock: 5000, deadlineBlock: 5200 });
    for (const c of node.calls.filter((c) => c.method === 'tx')) expect(c.params.wait_until).toBe('INCLUDED');
    expect(node.calls.some((c) => JSON.stringify(c.params).includes('EXECUTED'))).toBe(false);
    expect(node.calls.find((c) => c.method === 'query')!.params.method_name).toBe('get_season');
  });

  it('polls until the function receipt has opened the window (a block or two after inclusion)', async () => {
    const node = fakeNode({ tx: () => offerTx(), query: (_p, n) => view(n < 4 ? { leniency_open: false, leniency_open_block: null, leniency_deadline_block: null } : open) });
    expect(await makeChain(node.rpc).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ ok: true, deadlineBlock: 5200 });
    expect(node.calls.filter((c) => c.method === 'query').length).toBe(4);
  });

  it('rejects another account, another method, another season, extra actions (TX_MISMATCH)', async () => {
    const chain = (t: object) => makeChain(fakeNode({ tx: () => t, query: () => view(open) }).rpc);
    expect(await chain(offerTx({ signer_id: 'mallory.testnet' })).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ errorCode: 'TX_MISMATCH' });
    expect(await chain(offerTx({ receiver_id: 'other.testnet' })).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ errorCode: 'TX_MISMATCH' });
    expect(await chain(offerTx()).verifyLeniencyTx('H'.repeat(44), PLAYER, 8)).toMatchObject({ errorCode: 'TX_MISMATCH' });
    const wrongMethod = offerTx({ actions: [{ FunctionCall: { method_name: 'confess', args: toB64(utf8('{"season_id":7}')) } }] });
    expect(await chain(wrongMethod).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ errorCode: 'TX_MISMATCH' });
    const two = offerTx({ actions: [...offerTx().transaction.actions, ...offerTx().transaction.actions] });
    expect(await chain(two).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ errorCode: 'TX_MISMATCH' });
  });

  it('an unknown tx hash is TX_NOT_FOUND', async () => {
    expect(await makeChain(fakeNode({}).rpc).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ ok: false, errorCode: 'TX_NOT_FOUND' });
  });

  it('a window that never opens means the offer did not land: TX_FAILED, not an endless wait', async () => {
    const node = fakeNode({ tx: () => offerTx(), query: () => view({ leniency_open: false, leniency_open_block: null, leniency_deadline_block: null }) });
    expect(await makeChain(node.rpc).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ ok: false, errorCode: 'TX_FAILED' });
  });

  it('a definitive receipt failure shipped with the tx is surfaced with its contract code', async () => {
    const failed = {
      ...offerTx(),
      transaction_outcome: { block_hash: 'b', outcome: { status: { SuccessReceiptId: 'r' } } },
      receipts_outcome: [{ outcome: { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: E_NOT_PLAYER' } } } } } } }],
    };
    const r = await makeChain(fakeNode({ tx: () => failed, query: () => view(open) }).rpc).verifyLeniencyTx('H'.repeat(44), PLAYER, 7);
    expect(r).toMatchObject({ ok: false, errorCode: 'E_NOT_PLAYER' });
  });

  it('refuses a window opened by a different (older) tx: open block before this tx block', async () => {
    const withBlock = { ...offerTx(), transaction_outcome: { block_hash: 'bh', outcome: { status: { SuccessReceiptId: 'r' } } } };
    const node = fakeNode({ tx: () => withBlock, block: (p) => ({ header: { height: p.block_id === 'bh' ? 9000 : 1 } }), query: () => view(open) });
    expect(await makeChain(node.rpc).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ ok: false, errorCode: 'E_LENIENCY_OPEN' });
    const near = fakeNode({ tx: () => withBlock, block: (p) => ({ header: { height: p.block_id === 'bh' ? 4999 : 1 } }), query: () => view(open) });
    expect(await makeChain(near.rpc).verifyLeniencyTx('H'.repeat(44), PLAYER, 7)).toMatchObject({ ok: true });
  });
});
