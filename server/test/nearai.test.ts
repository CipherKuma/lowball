import { existsSync, readFileSync } from 'node:fs';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { keccak_256 } from '@noble/hashes/sha3';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_MODEL, NearAiLlm, extractJson } from '../src/llm/client.js';
import { JSON_SCHEMAS, BidOut } from '../src/llm/schemas.js';
import { eip191Digest, recoverEthAddress, sha256Hex, verifyReceipt } from '../src/llm/verify.js';
import { toHex, utf8 } from '../src/near/bytes.js';

// ---- EIP-191 digest against the published eth-account reference message hash ----
describe('EIP-191 digest', () => {
  it('matches the eth-account reference msghash for "I\u2665SF"', () => {
    expect(toHex(eip191Digest('I\u2665SF'))).toBe('1476abb745d423bf09273f1afd887d951181d25adc66c4834a70491911b7f750');
  });
  it('recovers the signer address from a signature over that digest', () => {
    const priv = secp256k1.utils.randomPrivateKey();
    const addr = '0x' + toHex(keccak_256(secp256k1.getPublicKey(priv, false).slice(1)).slice(12));
    const s = secp256k1.sign(eip191Digest('hello'), priv);
    expect(recoverEthAddress('hello', s.toCompactHex() + (s.recovery + 27).toString(16))).toBe(addr);
    expect(recoverEthAddress('hello', s.toCompactHex() + s.recovery.toString(16).padStart(2, '0'))).toBe(addr);
  });
});

// ---- Verification logic with a self-made signer (synthetic: real NEAR AI receipts need the API key) ----
const ecKey = secp256k1.utils.randomPrivateKey();
const ecAddr = '0x' + toHex(keccak_256(secp256k1.getPublicKey(ecKey, false).slice(1)).slice(12));
function ecSign(text: string): string {
  const s = secp256k1.sign(eip191Digest(text), ecKey);
  return s.toCompactHex() + (s.recovery + 27).toString(16);
}

describe('verifyReceipt', () => {
  const req = utf8('{"model":"m","messages":[]}');
  const resp = utf8('{"id":"chatcmpl-1","choices":[]}');
  const text = `${sha256Hex(req)}:${sha256Hex(resp)}`;
  const preflight = { signing_address: ecAddr, signing_algo: 'ecdsa' };

  it('accepts a gateway signature over the exact bytes from the preflight signer', () => {
    const v = verifyReceipt({
      requestBytes: req, responseBytes: resp, modelId: 'm', preflight,
      payload: { text, signature: ecSign(text), signing_address: ecAddr, signing_algo: 'ecdsa', signature_kind: 'gateway' },
    });
    expect(v).toMatchObject({ textMatches: true, signatureValid: true, signerMatchesPreflight: true, verified: true, quoteVerified: false });
  });

  it('rejects a response altered by one byte', () => {
    const v = verifyReceipt({
      requestBytes: req, responseBytes: utf8('{"id":"chatcmpl-1","choices":[ ]}'), modelId: 'm', preflight,
      payload: { text, signature: ecSign(text), signing_address: ecAddr, signing_algo: 'ecdsa', signature_kind: 'gateway' },
    });
    expect(v.textMatches).toBe(false);
    expect(v.verified).toBe(false);
  });

  it('rejects a signature from a different signer than the preflight', () => {
    const other = secp256k1.utils.randomPrivateKey();
    const s = secp256k1.sign(eip191Digest(text), other);
    const sig = s.toCompactHex() + (s.recovery + 27).toString(16);
    const v = verifyReceipt({
      requestBytes: req, responseBytes: resp, modelId: 'm', preflight,
      payload: { text, signature: sig, signing_address: ecAddr, signing_algo: 'ecdsa', signature_kind: 'gateway' },
    });
    expect(v.signatureValid).toBe(false);
    expect(v.verified).toBe(false);
  });

  it('flags a valid signature whose signer is not the attested gateway', () => {
    const v = verifyReceipt({
      requestBytes: req, responseBytes: resp, modelId: 'm',
      preflight: { signing_address: '0x' + '11'.repeat(20), signing_algo: 'ecdsa' },
      payload: { text, signature: ecSign(text), signing_address: ecAddr, signing_algo: 'ecdsa', signature_kind: 'gateway' },
    });
    expect(v.signatureValid).toBe(true);
    expect(v.signerMatchesPreflight).toBe(false);
    expect(v.verified).toBe(false);
  });

  it('verifies provider_tee text (model id prefix) and ed25519 signers matched to a preflight model signer', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const addr = toHex(ed25519.getPublicKey(seed));
    const t = `m:${sha256Hex(req)}:${sha256Hex(resp)}`;
    const sig = toHex(ed25519.sign(utf8(t), seed));
    const v = verifyReceipt({
      requestBytes: req, responseBytes: resp, modelId: 'm', preflight: null, modelSigners: [{ signing_address: addr, signing_algo: 'ed25519' }],
      payload: { text: t, signature: sig, signing_address: addr, signing_algo: 'ed25519', signature_kind: 'provider_tee' },
    });
    expect(v.verified).toBe(true);
    expect(v.signatureKind).toBe('provider_tee');
  });

  it('never trusts an unknown signature_kind', () => {
    const v = verifyReceipt({
      requestBytes: req, responseBytes: resp, modelId: 'm', preflight,
      payload: { text, signature: ecSign(text), signing_address: ecAddr, signing_algo: 'ecdsa' },
    });
    expect(v.signatureKind).toBe('unknown');
    expect(v.verified).toBe(false);
  });
});

// ---- Recorded REAL response: present once the API key lands (server/test/fixtures/nearai-recorded.json) ----
const RECORDED = new URL('./fixtures/nearai-recorded.json', import.meta.url);
describe('recorded real NEAR AI response', () => {
  it.skipIf(!existsSync(RECORDED))('verifies the recorded request, response and signature', () => {
    const rec = JSON.parse(readFileSync(RECORDED, 'utf8'));
    const v = verifyReceipt({
      requestBytes: utf8(rec.requestBody),
      responseBytes: utf8(rec.responseBody),
      modelId: rec.model,
      payload: rec.signature,
      preflight: rec.preflight,
    });
    expect(v.textMatches).toBe(true);
    expect(v.signatureValid).toBe(true);
  });
});

// ---- Client behaviour over a mock transport ----
function transport(replies: (url: string, init: any, n: number) => Response) {
  const calls: { url: string; init: any }[] = [];
  const fetchFn = (async (url: string, init: any) => {
    calls.push({ url, init });
    return replies(url, init, calls.length);
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}
const chat = (content: string, id = 'chatcmpl-x') =>
  new Response(JSON.stringify({ id, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('NearAiLlm', () => {
  const req = {
    buyer: 'odile' as const, kind: 'bid' as const, day: 2, system: 'sys', user: 'usr',
    schema: BidOut, jsonSchema: JSON_SCHEMAS.bid, schemaName: 'bid',
  };
  const noPreflight = (url: string) => (url.includes('/attestation/report') ? new Response('{}', { status: 200 }) : null);

  it('sends a json_schema structured-output request with bearer auth and parses the reply', async () => {
    const t = transport((url) => noPreflight(url) ?? (url.includes('/signature/') ? new Response('', { status: 404 }) : chat('{"amount":61,"say":"Sixty-one.","mood":"cold"}')));
    const llm = new NearAiLlm({ apiKey: 'k', fetchFn: t.fetchFn, sleep: async () => undefined });
    const r = await llm.complete(req);
    expect(r.value).toEqual({ amount: 61, say: 'Sixty-one.', mood: 'cold' });
    const post = t.calls.find((c) => c.url.endsWith('/chat/completions'))!;
    expect(post.init.headers.authorization).toBe('Bearer k');
    const body = JSON.parse(post.init.body);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    const receipt = await r.receipt;
    expect(receipt.verification.verified).toBe(false); // signature endpoint answered 404 in this transport
    expect(receipt.verification.error).toBe('signature unavailable');
  });

  it('retries exactly once on invalid JSON, then succeeds', async () => {
    let completions = 0;
    const t = transport((url) => {
      const p = noPreflight(url);
      if (p) return p;
      if (url.includes('/signature/')) return new Response('', { status: 404 });
      completions++;
      return completions === 1 ? chat('I think sixty') : chat('```json\n{"amount":60,"say":"ok","mood":"calm"}\n```');
    });
    const llm = new NearAiLlm({ apiKey: 'k', fetchFn: t.fetchFn, sleep: async () => undefined });
    const r = await llm.complete(req);
    expect(r.value.amount).toBe(60);
    expect(completions).toBe(2);
  });

  it('fails with MODEL_BAD_OUTPUT after the single retry (never fabricates a decision)', async () => {
    const t = transport((url) => noPreflight(url) ?? chat('{"amount":"lots"}'));
    const llm = new NearAiLlm({ apiKey: 'k', fetchFn: t.fetchFn, sleep: async () => undefined });
    await expect(llm.complete(req)).rejects.toMatchObject({ code: 'MODEL_BAD_OUTPUT' });
    expect(t.calls.filter((c) => c.url.endsWith('/chat/completions'))).toHaveLength(2);
  });

  it('MODEL_UNAVAILABLE on upstream 5xx, and on a non-retryable 401 without looping', async () => {
    const t5 = transport((url) => noPreflight(url) ?? new Response('bad gateway', { status: 502 }));
    await expect(new NearAiLlm({ apiKey: 'k', fetchFn: t5.fetchFn, sleep: async () => undefined }).complete(req)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    const t4 = transport((url) => noPreflight(url) ?? new Response('{"error":"invalid key"}', { status: 401 }));
    await expect(new NearAiLlm({ apiKey: 'bad', fetchFn: t4.fetchFn, sleep: async () => undefined }).complete(req)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(t4.calls.filter((c) => c.url.endsWith('/chat/completions'))).toHaveLength(1);
  });

  it('enforces a hard call budget', async () => {
    const t = transport((url) => noPreflight(url) ?? (url.includes('/signature/') ? new Response('', { status: 404 }) : chat('{"amount":1,"say":"x","mood":"calm"}')));
    const llm = new NearAiLlm({ apiKey: 'k', fetchFn: t.fetchFn, sleep: async () => undefined, maxCalls: 1 });
    await llm.complete(req);
    await expect(llm.complete(req)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  });

  it('verifies end to end when the gateway signs the exact bytes (synthetic gateway key)', async () => {
    let sentBody = '';
    let respBody = '';
    const t = transport((url, init) => {
      if (url.includes('/attestation/report')) return new Response(JSON.stringify({ gateway_attestation: { signing_address: ecAddr, signing_algo: 'ecdsa' } }));
      if (url.includes('/signature/')) {
        const text = `${sha256Hex(utf8(sentBody))}:${sha256Hex(utf8(respBody))}`;
        return new Response(JSON.stringify({ text, signature: ecSign(text), signing_address: ecAddr, signing_algo: 'ecdsa', signature_kind: 'gateway' }));
      }
      sentBody = init.body;
      const res = chat('{"amount":58,"say":"Fifty-eight.","mood":"calm"}', 'chatcmpl-abc');
      return res;
    });
    // capture response bytes the client will hash
    const orig = t.fetchFn;
    const wrapped = (async (url: string, init: any) => {
      const r = await orig(url, init);
      if (url.endsWith('/chat/completions')) respBody = await r.clone().text();
      return r;
    }) as unknown as typeof fetch;
    const llm = new NearAiLlm({ apiKey: 'k', fetchFn: wrapped, sleep: async () => undefined });
    const r = await llm.complete(req);
    const receipt = await r.receipt;
    expect(receipt.chatId).toBe('chatcmpl-abc');
    expect(receipt.verification.verified).toBe(true);
    expect(receipt.verification.signerMatchesPreflight).toBe(true);
  });

  it('extractJson tolerates fences and surrounding prose', () => {
    expect(extractJson('Sure! {"a":1} done')).toEqual({ a: 1 });
    expect(() => extractJson('nothing')).toThrow();
    expect(z.object({ a: z.number() }).parse(extractJson('```\n{"a":2}\n```')).a).toBe(2);
  });
});
