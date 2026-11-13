import { BorshWriter } from './borsh.js';
import { concat, toB64, toHex, utf8 } from './bytes.js';
import { sign, verify, type KeyPair } from './keys.js';
import type { PactJson, PactSigJson } from '../chain/types.js';

export const PACT_PREFIX = 'LOWBALL-PACT-v1:';

export interface Pact {
  seasonId: number;
  cap: number;
  members: string[];
  nonce: bigint;
}

/** borsh(Pact{season_id:u64, cap:u32, members:Vec<String>, nonce:u64}) */
export function encodePact(p: Pact): Uint8Array {
  const w = new BorshWriter().u64(p.seasonId).u32(p.cap);
  w.vec(p.members, (m) => w.string(m));
  return w.u64(p.nonce).done();
}

/** The exact bytes each member signs: b"LOWBALL-PACT-v1:" ++ borsh(pact). */
export function pactMessage(p: Pact): Uint8Array {
  return concat(utf8(PACT_PREFIX), encodePact(p));
}

export function signPact(p: Pact, key: KeyPair): Uint8Array {
  return sign(key, pactMessage(p));
}

export function verifyPactSig(p: Pact, sig: Uint8Array, publicKey: Uint8Array): boolean {
  return verify(sig, pactMessage(p), publicKey);
}

export function pactToJson(p: Pact): PactJson {
  return { season_id: p.seasonId, cap: p.cap, members: p.members, nonce: p.nonce.toString() };
}

export function sigToJson(signer: string, sig: Uint8Array): PactSigJson {
  return { signer, signature: toB64(sig) };
}

export function pactMessageHex(p: Pact): string {
  return toHex(pactMessage(p));
}

/** Random nonce below 2^52 so it is safe as a JSON number too. */
export function randomNonce(): bigint {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return (BigInt(b[0]! & 0xfffff) << 32n) | BigInt(b[1]!);
}
