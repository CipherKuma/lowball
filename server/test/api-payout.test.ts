// POST /api/session: the optional payoutEvm address is validated at the boundary (zod) before any chain work.
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { makeRig, PLAYER_PK } from './helpers.js';

const EVM = '0x' + 'Ab'.repeat(20);

function setup() {
  const rig = makeRig();
  const app = createApp({ deps: () => rig.deps, allowedOrigin: () => '*', maxSessionsPerIpHour: () => 99, elevenLabsKey: () => 'k', ttsMaxPerSession: () => 40 });
  const post = (body: unknown) => app.request('/api/session', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  return { rig, post };
}

describe('payoutEvm boundary', () => {
  it.each([
    '0x123',
    '0x' + 'g'.repeat(40),
    'ab'.repeat(20),
    '0x' + 'ab'.repeat(21),
    '',
    ' 0x' + 'ab'.repeat(20),
    42,
    null,
  ])('rejects %j with BAD_REQUEST and does no chain work', async (bad) => {
    const { rig, post } = setup();
    const r = await post({ playerPublicKey: PLAYER_PK, payoutEvm: bad });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code: string }).code).toBe('BAD_REQUEST');
    expect(rig.chain.log).toHaveLength(0);
  });

  it('accepts a 0x + 40 hex address, echoes it, and the contract season carries it', async () => {
    const { rig, post } = setup();
    const r = await post({ playerPublicKey: PLAYER_PK, payoutEvm: EVM });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { payoutEvm: string; sessionId: string };
    expect(j.payoutEvm).toBe(EVM);
  });

  it('is optional: no address means the NEAR payout (payoutEvm null)', async () => {
    const { post } = setup();
    const j = (await (await post({ playerPublicKey: PLAYER_PK })).json()) as { payoutEvm: unknown };
    expect(j.payoutEvm).toBeNull();
  });
});
