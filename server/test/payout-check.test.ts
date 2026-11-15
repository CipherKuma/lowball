// Payout-address guard: the desk cannot pay an address that does not exist on Sepolia yet (gas 207k > 21k).
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { checkPayoutAddress } from '../src/chainsig/check.js';
import type { EvmRpc } from '../src/chainsig/evm.js';
import type { Rpc } from '../src/near/rpc.js';
import type { PayoutCheckResult } from '../src/game/ctx.js';
import { makeRig, PLAYER_PK } from './helpers.js';

const FRESH = '0x' + 'cd'.repeat(20);
const USED = '0x' + 'Ab'.repeat(20);
const DESK = '0x1ce8073f6efe75470b199acf8b54532b4c499024';

function fakeNear(cfg: unknown, fail = false): Rpc {
  return {
    call: async (_m: string, p: { method_name: string }) => {
      if (fail) throw new Error('near down');
      const v = p.method_name === 'get_config' ? cfg : DESK;
      return { result: Array.from(new TextEncoder().encode(JSON.stringify(v))) };
    },
  } as unknown as Rpc;
}
const fakeEvm = (gasFor: (to: string) => bigint, fail = false): EvmRpc =>
  ({ estimateGas: async (t: { to: string }) => { if (fail) throw new Error('rpc down'); return gasFor(t.to); } }) as unknown as EvmRpc;
const CFG = { gas_limit: 21000, derived_address: DESK };

describe('checkPayoutAddress', () => {
  const gas = (to: string) => (to === FRESH ? 207391n : 21000n);
  it('rejects a fresh address', async () => {
    expect(await checkPayoutAddress(FRESH, { near: fakeNear(CFG), evm: fakeEvm(gas), deskId: 'd' })).toMatchObject({ ok: false, gasNeeded: '207391', gasLimit: '21000' });
  });
  it('accepts an existing address', async () => {
    expect(await checkPayoutAddress(USED, { near: fakeNear(CFG), evm: fakeEvm(gas), deskId: 'd' })).toEqual({ ok: true, gasNeeded: '21000', gasLimit: '21000' });
  });
  it('is unchecked when Sepolia or the desk view fails', async () => {
    expect((await checkPayoutAddress(FRESH, { near: fakeNear(CFG), evm: fakeEvm(gas, true), deskId: 'd' })).reason).toBe('unchecked');
    const r = await checkPayoutAddress(FRESH, { near: fakeNear(CFG, true), evm: fakeEvm(gas), deskId: 'd' });
    expect(r).toMatchObject({ ok: true, reason: 'unchecked' });
  });
});

function setup(check?: (to: string) => Promise<PayoutCheckResult>) {
  const rig = makeRig();
  rig.deps.payout = { check, relay: async () => { throw new Error('unused'); } };
  const app = createApp({ deps: () => rig.deps, allowedOrigin: () => '*', maxSessionsPerIpHour: () => 99, elevenLabsKey: () => 'k', ttsMaxPerSession: () => 40 });
  const post = (body: unknown) => app.request('/api/session', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  return { rig, app, post };
}
const verdict = async (to: string): Promise<PayoutCheckResult> =>
  to === FRESH ? { ok: false, gasNeeded: '207391', gasLimit: '21000', reason: 'new' } : { ok: true, gasNeeded: '21000', gasLimit: '21000' };

describe('POST /api/session guard', () => {
  it('refuses a fresh address with 422 and creates nothing', async () => {
    const { rig, post } = setup(verdict);
    const r = await post({ playerPublicKey: PLAYER_PK, payoutEvm: FRESH });
    expect(r.status).toBe(422);
    const j = (await r.json()) as { code: string; error: string };
    expect(j.code).toBe('PAYOUT_ADDRESS_UNSUPPORTED');
    expect(j.error).toContain('never been used on Sepolia');
    expect(rig.chain.log).toHaveLength(0);
  });
  it('creates a session for an existing address', async () => {
    const { post } = setup(verdict);
    const r = await post({ playerPublicKey: PLAYER_PK, payoutEvm: USED });
    expect(r.status).toBe(200);
  });
  it('creates a session when the check was unchecked (RPC failure)', async () => {
    const { post } = setup(async () => ({ ok: true, gasNeeded: '0', gasLimit: '0', reason: 'unchecked' }));
    expect((await post({ playerPublicKey: PLAYER_PK, payoutEvm: FRESH })).status).toBe(200);
  });
  it('does not check when no payoutEvm is given', async () => {
    let calls = 0;
    const { post } = setup(async (t) => { calls++; return verdict(t); });
    expect((await post({ playerPublicKey: PLAYER_PK })).status).toBe(200);
    expect(calls).toBe(0);
  });
});

describe('GET /api/payout/check', () => {
  it.each(['', '0x123', '0x' + 'g'.repeat(40)])('400 BAD_REQUEST for %j', async (bad) => {
    const { app } = setup(verdict);
    const r = await app.request(`/api/payout/check?to=${bad}`);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code: string }).code).toBe('BAD_REQUEST');
  });
  it('400 when to is missing', async () => {
    expect((await setup(verdict).app.request('/api/payout/check')).status).toBe(400);
  });
  it('returns the ok:false and ok:true shapes', async () => {
    const { app } = setup(verdict);
    expect(await (await app.request(`/api/payout/check?to=${FRESH}`)).json()).toEqual({ ok: false, gasNeeded: '207391', gasLimit: '21000', reason: 'new' });
    expect(await (await app.request(`/api/payout/check?to=${USED}`)).json()).toEqual({ ok: true, gasNeeded: '21000', gasLimit: '21000' });
  });
});
