// Offline derivation of the desk's Ethereum address from the MPC root key (NEAR chain signatures KDF).
//   tweak   = sha3_256("near-mpc-recovery v0.1.0 epsilon derivation:" + predecessor + "," + path)
//   derived = root + tweak * G          (secp256k1)
//   address = keccak256(X || Y)[12..]   (EIP-55 checksummed for display)
// Source: near/mpc crates/near-mpc-crypto-types/src/kdf.rs and crates/contract/src/crypto_shared/kdf.rs.
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256, sha3_256 } from '@noble/hashes/sha3';
import { b58decode } from '../near/base58.js';
import { toHex, utf8 } from '../near/bytes.js';

export const TWEAK_PREFIX = 'near-mpc-recovery v0.1.0 epsilon derivation:';
export const DESK_PATH = 'lowball-desk-v1';

/** `secp256k1:<base58 of X||Y>` (NEAR key string) to 64 bytes. */
export function parseNearSecp256k1(key: string): Uint8Array {
  const m = /^secp256k1:(.+)$/.exec(key);
  if (!m) throw new Error('not a secp256k1: key');
  const raw = b58decode(m[1]!);
  if (raw.length !== 64) throw new Error(`secp256k1 key must be 64 bytes, got ${raw.length}`);
  return raw;
}

export function deriveNearKey(rootKey: string, predecessor: string, path: string): Uint8Array {
  const root = secp256k1.ProjectivePoint.fromHex(new Uint8Array([4, ...parseNearSecp256k1(rootKey)]));
  const tweak = BigInt(`0x${toHex(sha3_256(utf8(`${TWEAK_PREFIX}${predecessor},${path}`)))}`);
  if (tweak >= secp256k1.CURVE.n) throw new Error('tweak is not a valid scalar');
  const derived = secp256k1.ProjectivePoint.BASE.multiply(tweak).add(root);
  return derived.toRawBytes(false).slice(1);
}

export function addressFromPubkey64(pub: Uint8Array): string {
  if (pub.length !== 64) throw new Error('expected 64-byte public key');
  return eip55(`0x${toHex(keccak_256(pub).slice(12))}`);
}

export function eip55(addr: string): string {
  const lower = addr.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(lower)) throw new Error('invalid address');
  const h = toHex(keccak_256(utf8(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(h[i]!, 16) >= 8 ? lower[i]!.toUpperCase() : lower[i]!;
  return out;
}

export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export const deriveDeskAddress = (rootKey: string, deskAccount: string, path = DESK_PATH): string =>
  addressFromPubkey64(deriveNearKey(rootKey, deskAccount, path));
