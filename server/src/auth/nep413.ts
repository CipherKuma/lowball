// NEP-413 "sign a message" verification. https://github.com/near/NEPs/blob/master/neps/nep-0413.md
import { sha256 } from '@noble/hashes/sha256';
import { BorshWriter } from '../near/borsh.js';
import { verify } from '../near/keys.js';

/** 2^31 + 413 */
export const NEP413_TAG = 2147484061;

/** sha256(borsh({tag, message, nonce, recipient, callbackUrl: None})): the 32 bytes the wallet signs. */
export function nep413Hash(p: { message: string; nonce: Uint8Array; recipient: string; callbackUrl?: string | null }): Uint8Array {
  if (p.nonce.length !== 32) throw new Error('nonce must be 32 bytes');
  const w = new BorshWriter().u32(NEP413_TAG).string(p.message).bytes(p.nonce).string(p.recipient);
  w.option(p.callbackUrl ?? null, (u) => w.string(u));
  return sha256(w.done());
}

export function verifyNep413(p: { message: string; nonce: Uint8Array; recipient: string }, signature: Uint8Array, publicKey: Uint8Array): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) return false;
  return verify(signature, nep413Hash(p), publicKey);
}
