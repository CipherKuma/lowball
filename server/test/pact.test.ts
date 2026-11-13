import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromB64, fromHex, toB64, toHex } from '../src/near/bytes.js';
import { generateKeyPair, verify } from '../src/near/keys.js';
import { encodePact, pactMessage, pactMessageHex, signPact, verifyPactSig, type Pact } from '../src/near/pact.js';
import { ed25519 } from '@noble/curves/ed25519';

const ENCODING_DOC = new URL('../../contract/PACT_ENCODING.md', import.meta.url);

describe('pact encoding', () => {
  it('lays out borsh(Pact) as u64 | u32 | vec<string> | u64, little endian', () => {
    const p: Pact = { seasonId: 7, cap: 40, members: ['a.t', 'bb.t'], nonce: 258n };
    const hex = toHex(encodePact(p));
    expect(hex).toBe(
      '0700000000000000' + // season_id
        '28000000' + // cap
        '02000000' + // members.len
        '03000000' + '612e74' + // "a.t"
        '04000000' + '62622e74' + // "bb.t"
        '0201000000000000', // nonce 258
    );
  });

  it('prefixes the message with LOWBALL-PACT-v1:', () => {
    const p: Pact = { seasonId: 1, cap: 1, members: ['x.t'], nonce: 1n };
    expect(new TextDecoder().decode(pactMessage(p).slice(0, 16))).toBe('LOWBALL-PACT-v1:');
  });

  it('signs and verifies, and a signature for another season does not verify', () => {
    const kp = generateKeyPair();
    const p: Pact = { seasonId: 3, cap: 50, members: ['m.t', 'o.t'], nonce: 99n };
    const sig = signPact(p, kp);
    expect(verifyPactSig(p, sig, kp.publicKey)).toBe(true);
    expect(verifyPactSig({ ...p, seasonId: 4 }, sig, kp.publicKey)).toBe(false);
    expect(verifyPactSig({ ...p, cap: 51 }, sig, kp.publicKey)).toBe(false);
    expect(verify(sig, pactMessage(p), generateKeyPair().publicKey)).toBe(false);
  });
});

describe('contract test vector (contract/PACT_ENCODING.md)', () => {
  const present = existsSync(ENCODING_DOC);
  it.skipIf(!present)('reproduces borsh bytes, message and signature exactly', () => {
    const doc = readFileSync(ENCODING_DOC, 'utf8');
    const block = /```vector\n([\s\S]*?)```/.exec(doc)![1]!;
    const f = (k: string) => new RegExp(`^${k}: (.*)$`, 'm').exec(block)![1]!.trim();
    const pactJson = JSON.parse(f('pact_json')) as { season_id: number; cap: number; members: string[]; nonce: string };
    const pact: Pact = {
      seasonId: pactJson.season_id,
      cap: pactJson.cap,
      members: pactJson.members,
      nonce: BigInt(pactJson.nonce),
    };
    const seed = fromHex(f('secret_key_hex'));
    expect(toB64(ed25519.getPublicKey(seed))).toBe(f('public_key_b64'));
    expect(toHex(encodePact(pact))).toBe(f('borsh_hex'));
    expect(pactMessageHex(pact)).toBe(f('message_hex'));
    const sig = signPact(pact, { seed, publicKey: ed25519.getPublicKey(seed) });
    expect(toB64(sig)).toBe(f('signature_b64'));
    expect(verifyPactSig(pact, fromB64(f('signature_b64')), fromB64(f('public_key_b64')))).toBe(true);
  });
});
