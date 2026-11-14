// EIP-191 personal_sign recovery with @noble (no viem: smaller Worker bundle, same maths).
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';

const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

/** keccak256("\x19Ethereum Signed Message:\n" + len + text) */
export function eip191Hash(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const all = new Uint8Array(prefix.length + body.length);
  all.set(prefix);
  all.set(body, prefix.length);
  return keccak_256(all);
}

/** Lowercase 0x address that signed `text` (65-byte r||s||v hex, v 0/1/27/28). Throws on a malformed signature. */
export function recoverEvmAddress(text: string, signatureHex: string): string {
  const raw = hexToBytes(signatureHex.replace(/^0x/, ''));
  if (raw.length !== 65) throw new Error('signature must be 65 bytes');
  const v = raw[64]!;
  const rec = v >= 27 ? v - 27 : v;
  if (rec !== 0 && rec !== 1) throw new Error('bad recovery id');
  const sig = secp256k1.Signature.fromCompact(raw.slice(0, 64)).addRecoveryBit(rec);
  const pub = sig.recoverPublicKey(eip191Hash(text)).toRawBytes(false); // 65 bytes, 0x04 prefix
  return '0x' + bytesToHex(keccak_256(pub.slice(1)).slice(12));
}
