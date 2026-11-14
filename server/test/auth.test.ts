// Wallet sign-in (NEP-413) and wallet-mode seasons.
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { nep413Hash, NEP413_TAG } from '../src/auth/nep413.js';
import { DEFAULT_RECIPIENT, SIGN_IN_MESSAGE, tokenHash } from '../src/auth/service.js';
import { toB64, toHex } from '../src/near/bytes.js';
import { formatPublicKey, generateKeyPair, sign } from '../src/near/keys.js';
import { Rpc } from '../src/near/rpc.js';
import { makeRig } from './helpers.js';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { eip191Hash, recoverEvmAddress } from '../src/auth/evm.js';
import { evmSignInText } from '../../shared/api.js';

type Perm = 'FullAccess' | 'FunctionCall' | 'missing';

function setup(opts: { now?: { t: number }; perm?: Perm } = {}) {
  const rig = makeRig();
  const kp = generateKeyPair();
  const pk = formatPublicKey(kp.publicKey);
  const clock = opts.now ?? { t: 1_800_000_000_000 };
  const calls: any[] = [];
  const state = { perm: (opts.perm ?? 'FullAccess') as Perm };
  const fetchFn = (async (_url: string, init: any) => {
    const req = JSON.parse(init.body);
    calls.push(req.params);
    const reply = (o: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: req.id, ...(o as object) }), { status: 200 });
    if (state.perm === 'missing') return reply({ error: { code: -32000, name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCESS_KEY' }, message: 'x' } });
    return reply({ result: { nonce: 1, permission: state.perm === 'FullAccess' ? 'FullAccess' : { FunctionCall: { allowance: '1', receiver_id: 'c.testnet', method_names: [] } } } });
  }) as unknown as typeof fetch;
  const rpc = new Rpc({ urls: ['http://rpc.test'], fetchFn });
  let createPlayerCalls = 0;
  const orig = rig.chain.createPlayer.bind(rig.chain);
  rig.chain.createPlayer = (async (...a: any[]) => {
    createPlayerCalls++;
    return (orig as any)(...a);
  }) as never;
  const app = createApp({
    deps: () => rig.deps,
    auth: () => ({ store: rig.store, rpc, recipient: DEFAULT_RECIPIENT, now: () => clock.t }),
    allowedOrigin: () => '*',
    maxSessionsPerIpHour: () => 99,
    elevenLabsKey: () => 'k',
    ttsMaxPerSession: () => 40,
  });
  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: 'POST', body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
  const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers });
  const nonce = async () => (await (await post('/api/auth/nonce')).json()) as any;
  const signed = (n: { nonce: string; recipient: string; message: string }, over: Record<string, unknown> = {}) => {
    const hash = nep413Hash({ message: n.message, nonce: Uint8Array.from(atob(n.nonce), (c) => c.charCodeAt(0)), recipient: n.recipient });
    return { accountId: 'alice.testnet', publicKey: pk, signature: toB64(sign(kp, hash)), nonce: n.nonce, recipient: n.recipient, message: n.message, ...over };
  };
  const login = async () => {
    const r = await post('/api/auth/verify', signed(await nonce()));
    return { r, j: (await r.json()) as any };
  };
  return { rig, kp, pk, clock, calls, state, app, post, get, nonce, signed, login, createPlayerCalls: () => createPlayerCalls };
}

const code = async (r: Response) => ((await r.json()) as any).code;

describe('NEP-413 sign-in', () => {
  it('uses the NEP-413 tag and a fixed known hash layout', () => {
    expect(NEP413_TAG).toBe(2 ** 31 + 413);
    const h = nep413Hash({ message: 'm', nonce: new Uint8Array(32), recipient: 'r' });
    expect(h).toHaveLength(32);
    expect(toHex(h)).toBe(toHex(nep413Hash({ message: 'm', nonce: new Uint8Array(32), recipient: 'r' })));
    expect(toHex(h)).not.toBe(toHex(nep413Hash({ message: 'm', nonce: new Uint8Array(32), recipient: 'r', callbackUrl: 'x' })));
  });

  it('nonce endpoint returns 32 random bytes, recipient, message, expiry', async () => {
    const t = setup();
    const n = await t.nonce();
    expect(atob(n.nonce)).toHaveLength(32);
    expect(n.recipient).toBe('play.lowball-game.pages.dev');
    expect(n.message).toBe(SIGN_IN_MESSAGE);
    expect(n.expiresAt).toBe(t.clock.t + 5 * 60_000);
    expect((await t.nonce()).nonce).not.toBe(n.nonce);
  });

  it('round trip: verify, /me, logout; only the token hash is stored; key checked at final finality', async () => {
    const t = setup();
    const { r, j } = await t.login();
    expect(r.status).toBe(200);
    expect(j.accountId).toBe('alice.testnet');
    expect(j.expiresAt).toBe(t.clock.t + 12 * 3_600_000);
    expect(j.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t.calls[0]).toMatchObject({ request_type: 'view_access_key', finality: 'final', account_id: 'alice.testnet', public_key: t.pk });
    expect([...t.rig.store.authSessions.keys()]).toEqual([tokenHash(j.token)]);
    expect(JSON.stringify([...t.rig.store.authSessions.entries()])).not.toContain(j.token);
    const auth = { authorization: `Bearer ${j.token}` };
    expect(await (await t.get('/api/auth/me', auth)).json()).toEqual({ accountId: 'alice.testnet' });
    expect((await t.post('/api/auth/logout', undefined, auth)).status).toBe(200);
    const after = await t.get('/api/auth/me', auth);
    expect(after.status).toBe(401);
    expect(await after.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('/me without or with a bad token is 401 AUTH_REQUIRED; tokens expire after 12 h', async () => {
    const t = setup();
    expect(await code(await t.get('/api/auth/me'))).toBe('AUTH_REQUIRED');
    expect(await code(await t.get('/api/auth/me', { authorization: 'Bearer ' + 'a'.repeat(43) }))).toBe('AUTH_REQUIRED');
    const { j } = await t.login();
    t.clock.t += 12 * 3_600_000 + 1;
    expect((await t.get('/api/auth/me', { authorization: `Bearer ${j.token}` })).status).toBe(401);
  });

  it('wrong recipient and wrong message are AUTH_BAD_RECIPIENT', async () => {
    const t = setup();
    const n = await t.nonce();
    const a = await t.post('/api/auth/verify', t.signed(n, { recipient: 'evil.example' }));
    expect(a.status).toBe(401);
    expect(await code(a)).toBe('AUTH_BAD_RECIPIENT');
    expect(await code(await t.post('/api/auth/verify', t.signed(n, { message: 'Send me your money' })))).toBe('AUTH_BAD_RECIPIENT');
    // a signature made over another recipient but presented with the issued one fails the signature
    const other = t.signed({ ...n, recipient: 'evil.example' });
    expect(await code(await t.post('/api/auth/verify', { ...other, recipient: n.recipient }))).toBe('AUTH_BAD_SIGNATURE');
  });

  it('a tampered signature, another key, or another nonce is AUTH_BAD_SIGNATURE and does not burn the nonce', async () => {
    const t = setup();
    const n = await t.nonce();
    const good = t.signed(n);
    const bytes = Uint8Array.from(atob(good.signature), (c) => c.charCodeAt(0));
    bytes[5] = bytes[5]! ^ 1;
    expect(await code(await t.post('/api/auth/verify', { ...good, signature: toB64(bytes) }))).toBe('AUTH_BAD_SIGNATURE');
    expect(await code(await t.post('/api/auth/verify', { ...good, publicKey: formatPublicKey(generateKeyPair().publicKey) }))).toBe('AUTH_BAD_SIGNATURE');
    const n2 = await t.nonce();
    expect(await code(await t.post('/api/auth/verify', { ...good, nonce: n2.nonce }))).toBe('AUTH_BAD_SIGNATURE');
    expect((await t.post('/api/auth/verify', good)).status).toBe(200);
  });

  it('a replayed nonce fails with AUTH_NONCE_USED, also when raced', async () => {
    const t = setup();
    const body = t.signed(await t.nonce());
    const [a, b] = await Promise.all([t.post('/api/auth/verify', body), t.post('/api/auth/verify', body)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    const replay = await t.post('/api/auth/verify', body);
    expect(replay.status).toBe(401);
    expect(await code(replay)).toBe('AUTH_NONCE_USED');
  });

  it('an expired nonce fails with AUTH_NONCE_EXPIRED; a nonce never issued is AUTH_NONCE_UNKNOWN', async () => {
    const t = setup();
    const n = await t.nonce();
    t.clock.t += 5 * 60_000 + 1;
    const r = await t.post('/api/auth/verify', t.signed(n));
    expect(r.status).toBe(401);
    expect(await code(r)).toBe('AUTH_NONCE_EXPIRED');
    const fake = { nonce: toB64(crypto.getRandomValues(new Uint8Array(32))), recipient: DEFAULT_RECIPIENT, message: SIGN_IN_MESSAGE };
    expect(await code(await t.post('/api/auth/verify', t.signed(fake)))).toBe('AUTH_NONCE_UNKNOWN');
  });

  it('a function-call-only key or a key not on the account is AUTH_NOT_FULL_ACCESS', async () => {
    const t = setup({ perm: 'FunctionCall' });
    const r = await t.post('/api/auth/verify', t.signed(await t.nonce()));
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: 'AUTH_NOT_FULL_ACCESS' });
    t.state.perm = 'missing';
    expect(await code(await t.post('/api/auth/verify', t.signed(await t.nonce())))).toBe('AUTH_NOT_FULL_ACCESS');
  });

  it('an implicit account matching its own key is accepted only while the account does not exist', async () => {
    const t = setup({ perm: 'missing' });
    const implicit = toHex(t.kp.publicKey);
    // view_access_key and view_account both unknown: the account does not exist yet, so the key bytes decide
    const fetchFn = (async (_u: string, init: any) => {
      const req = JSON.parse(init.body);
      const name = req.params.request_type === 'view_account' ? 'UNKNOWN_ACCOUNT' : 'UNKNOWN_ACCESS_KEY';
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, name: 'HANDLER_ERROR', cause: { name }, message: 'x' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const app = createApp({
      deps: () => t.rig.deps,
      auth: () => ({ store: t.rig.store, rpc: new Rpc({ urls: ['http://rpc.test'], fetchFn }), recipient: DEFAULT_RECIPIENT, now: () => t.clock.t }),
      allowedOrigin: () => '*', maxSessionsPerIpHour: () => 99, elevenLabsKey: () => 'k', ttsMaxPerSession: () => 40,
    });
    const send = async (accountId: string) => {
      const n = (await (await app.request('/api/auth/nonce', { method: 'POST' })).json()) as any;
      return app.request('/api/auth/verify', { method: 'POST', body: JSON.stringify(t.signed(n, { accountId })), headers: { 'content-type': 'application/json' } });
    };
    expect((await send(implicit)).status).toBe(200);
    expect(await code(await send('bob.testnet'))).toBe('AUTH_NOT_FULL_ACCESS');
    expect(await code(await send('f'.repeat(64)))).toBe('AUTH_NOT_FULL_ACCESS');
  });

  it('malformed bodies are 400 BAD_REQUEST with {error, code} only', async () => {
    const t = setup();
    const n = await t.nonce();
    const good = t.signed(n);
    const bads: unknown[] = ['not json', {}, { ...good, extra: 1 }, { ...good, accountId: 'A B' }, { ...good, publicKey: 'nope' }, { ...good, signature: '!!' }, { ...good, nonce: 7 }, { ...good, signature: toB64(new Uint8Array(10)) }, { ...good, nonce: toB64(new Uint8Array(8)) }];
    for (const b of bads) {
      const r = await t.post('/api/auth/verify', b);
      expect(r.status).toBe(400);
      const j = (await r.json()) as any;
      expect(j.code).toBe('BAD_REQUEST');
      expect(Object.keys(j).sort()).toEqual(['code', 'error']);
    }
    // none of the bad attempts burned the nonce
    expect((await t.post('/api/auth/verify', good)).status).toBe(200);
  });
});

describe('wallet-mode seasons', () => {
  it('uses the token account as player, creates and funds nothing, and reports playerKind', async () => {
    const t = setup();
    const { j } = await t.login();
    const r = await t.post('/api/session', { mode: 'wallet', payoutEvm: '0x' + 'ab'.repeat(20) }, { authorization: `Bearer ${j.token}` });
    expect(r.status).toBe(200);
    const s = (await r.json()) as any;
    expect(s.playerAccountId).toBe('alice.testnet');
    expect(s.playerKind).toBe('wallet');
    expect(s.payoutEvm).toBe('0x' + 'ab'.repeat(20));
    expect(t.createPlayerCalls()).toBe(0);
    const st = (await t.rig.store.loadState(s.sessionId))!;
    expect(st.playerKind).toBe('wallet');
    expect(st.playerAccountId).toBe('alice.testnet');
    const ev = (await (await t.get(`/api/session/${s.sessionId}/events?after=0`)).json()) as any;
    expect(ev.status.playerKind).toBe('wallet');
    // the season is created for the wallet account
    expect((await t.post(`/api/session/${s.sessionId}/step`, { action: 'begin' })).status).toBe(200);
    const seasonId = (await t.rig.store.loadState(s.sessionId))!.seasonId!;
    expect((await t.rig.chain.getSeason(seasonId)).player).toBe('alice.testnet');
  });

  it('wallet mode without a valid token is AUTH_REQUIRED and starts nothing', async () => {
    const t = setup();
    for (const h of [{} as Record<string, string>, { authorization: 'Bearer ' + 'z'.repeat(43) }]) {
      const r = await t.post('/api/session', { mode: 'wallet' }, h);
      expect(r.status).toBe(401);
      expect(await code(r)).toBe('AUTH_REQUIRED');
    }
    expect(t.rig.store.states.size).toBe(0);
    expect(t.createPlayerCalls()).toBe(0);
  });

  it('refuses the house account and unknown fields in wallet mode', async () => {
    const t = setup();
    t.rig.store.authSessions.set(tokenHash('h'.repeat(43)), { accountId: t.rig.chain.houseId, expiresAt: t.clock.t + 1000 });
    const r = await t.post('/api/session', { mode: 'wallet' }, { authorization: 'Bearer ' + 'h'.repeat(43) });
    expect(r.status).toBe(400);
    const { j } = await t.login();
    expect((await t.post('/api/session', { mode: 'wallet', playerPublicKey: t.pk }, { authorization: `Bearer ${j.token}` })).status).toBe(400);
  });

  it('guest mode is unchanged: a key creates a sub-account, a token is ignored, playerKind is guest', async () => {
    const t = setup();
    const { j } = await t.login();
    const r = await t.post('/api/session', { playerPublicKey: t.pk }, { authorization: `Bearer ${j.token}` });
    expect(r.status).toBe(200);
    const s = (await r.json()) as any;
    expect(s.playerAccountId).toMatch(/\.house\.mock\.testnet$/);
    expect(s.playerKind).toBe('guest');
    expect(t.createPlayerCalls()).toBe(1);
    const ev = (await (await t.get(`/api/session/${s.sessionId}/events?after=0`)).json()) as any;
    expect(ev.events[0].type).toBe('account_created');
    // a guest body with mode other than wallet is still rejected by the strict guest schema
    expect((await t.post('/api/session', { playerPublicKey: t.pk, mode: 'guest' })).status).toBe(400);
  });
});

describe('Ethereum Wallets sign-in (EIP-191)', () => {
  const evmKey = secp256k1.utils.randomPrivateKey();
  const addrOf = (k: Uint8Array) => '0x' + bytesToHex(keccak_256(secp256k1.getPublicKey(k, false).slice(1)).slice(12));
  const addr = addrOf(evmKey);
  const personalSign = (text: string, k = evmKey, vOffset = 27) => {
    const s = secp256k1.sign(eip191Hash(text), k);
    return '0x' + s.toCompactHex() + (s.recovery + vOffset).toString(16).padStart(2, '0');
  };
  const body = (n: { nonce: string; recipient: string; message: string }, over: Record<string, unknown> = {}) => ({
    accountId: addr,
    signature: personalSign(evmSignInText(n)),
    nonce: n.nonce,
    recipient: n.recipient,
    message: n.message,
    ...over,
  });

  it('matches the known EIP-191 vector (hello world, key 0x…01)', () => {
    const k = new Uint8Array(32);
    k[31] = 1;
    expect(addrOf(k)).toBe('0x7e5f4552091a69125d5dfcb7b8c2659029395bdf');
    expect(recoverEvmAddress('hello', personalSign('hello', k))).toBe(addrOf(k));
  });

  it('valid signature: session for the lowercase 0x id, no RPC call', async () => {
    const t = setup();
    const r = await t.post('/api/auth/verify-evm', body(await t.nonce()));
    const j = (await r.json()) as any;
    expect(r.status).toBe(200);
    expect(j.accountId).toBe(addr);
    expect(t.calls).toHaveLength(0);
    const me = await t.get('/api/auth/me', { authorization: `Bearer ${j.token}` });
    expect(((await me.json()) as any).accountId).toBe(addr);
  });

  it('accepts v as 0/1 too', async () => {
    const t = setup();
    const n = await t.nonce();
    const r = await t.post('/api/auth/verify-evm', body(n, { signature: personalSign(evmSignInText(n), evmKey, 0) }));
    expect(r.status).toBe(200);
  });

  it('wrong address: signature by another key', async () => {
    const t = setup();
    const n = await t.nonce();
    const other = secp256k1.utils.randomPrivateKey();
    const r = await t.post('/api/auth/verify-evm', body(n, { signature: personalSign(evmSignInText(n), other) }));
    expect(r.status).toBe(401);
    expect(await code(r)).toBe('AUTH_BAD_SIGNATURE');
  });

  it('wrong address: claimed account differs from signer', async () => {
    const t = setup();
    const r = await t.post('/api/auth/verify-evm', body(await t.nonce(), { accountId: '0x' + '11'.repeat(20) }));
    expect(await code(r)).toBe('AUTH_BAD_SIGNATURE');
  });

  it('replayed nonce is refused', async () => {
    const t = setup();
    const n = await t.nonce();
    expect((await t.post('/api/auth/verify-evm', body(n))).status).toBe(200);
    expect(await code(await t.post('/api/auth/verify-evm', body(n)))).toBe('AUTH_NONCE_USED');
  });

  it('expired nonce is refused', async () => {
    const t = setup();
    const n = await t.nonce();
    t.clock.t += 5 * 60_000 + 1;
    expect(await code(await t.post('/api/auth/verify-evm', body(n)))).toBe('AUTH_NONCE_EXPIRED');
  });

  it('tampered message, recipient or nonce is refused and does not burn the nonce', async () => {
    const t = setup();
    const n = await t.nonce();
    expect(await code(await t.post('/api/auth/verify-evm', body(n, { message: 'Send me your money' })))).toBe('AUTH_BAD_RECIPIENT');
    expect(await code(await t.post('/api/auth/verify-evm', body(n, { recipient: 'evil.example' })))).toBe('AUTH_BAD_RECIPIENT');
    // signature over a different text
    const bad = body(n, { signature: personalSign(evmSignInText({ ...n, message: 'other' })) });
    expect(await code(await t.post('/api/auth/verify-evm', bad))).toBe('AUTH_BAD_SIGNATURE');
    // signature over another nonce
    const n2 = await t.nonce();
    expect(await code(await t.post('/api/auth/verify-evm', body(n, { signature: personalSign(evmSignInText(n2)) })))).toBe('AUTH_BAD_SIGNATURE');
    expect((await t.post('/api/auth/verify-evm', body(n))).status).toBe(200);
  });

  it('rejects malformed input and uppercase account ids', async () => {
    const t = setup();
    const n = await t.nonce();
    expect((await t.post('/api/auth/verify-evm', body(n, { signature: '0x12' }))).status).toBe(400);
    expect((await t.post('/api/auth/verify-evm', body(n, { accountId: addr.toUpperCase().replace('0X', '0x') }))).status).toBe(400);
    expect((await t.post('/api/auth/verify-evm', body(n, { extra: 1 }))).status).toBe(400);
  });
});
