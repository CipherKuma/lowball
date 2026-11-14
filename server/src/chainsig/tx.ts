// EIP-1559 (type 0x02) transfer: signing preimage, digest, signed serialisation. Mirrors
// contracts/payout-desk/src/tx.rs byte for byte (both checked against viem in tests).
import { keccak_256 } from '@noble/hashes/sha3';
import { concat, fromHex, toHex } from '../near/bytes.js';
import { rlpDecode, rlpEncode, uintBytes, type Rlp } from './rlp.js';

export interface Transfer {
  chainId: bigint;
  nonce: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  /** lower-case 0x + 40 hex */
  to: string;
  valueWei: bigint;
}

const EMPTY = new Uint8Array(0);

function fields(t: Transfer): Rlp[] {
  return [
    uintBytes(t.chainId),
    uintBytes(t.nonce),
    uintBytes(t.maxPriorityFeePerGas),
    uintBytes(t.maxFeePerGas),
    uintBytes(t.gasLimit),
    fromHex(t.to),
    uintBytes(t.valueWei),
    EMPTY, // data
    [], // access list
  ];
}

export function signingPreimage(t: Transfer): Uint8Array {
  return concat(Uint8Array.of(0x02), rlpEncode(fields(t)));
}

export const keccak = (b: Uint8Array): Uint8Array => keccak_256(b);

function strip(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length && b[i] === 0) i++;
  return b.slice(i);
}

/** Signed raw transaction. r and s are 32-byte big-endian; yParity is 0 or 1. */
export function serializeSigned(t: Transfer, yParity: 0 | 1, r: Uint8Array, s: Uint8Array): Uint8Array {
  return concat(Uint8Array.of(0x02), rlpEncode([...fields(t), uintBytes(BigInt(yParity)), strip(r), strip(s)]));
}

export const txHash = (signedRaw: Uint8Array): string => `0x${toHex(keccak(signedRaw))}`;

/** Parse an unsigned type-2 preimage (as stored by the desk) back into its fields. */
export function parseUnsigned(hex: string): Transfer {
  const raw = fromHex(hex);
  if (raw[0] !== 0x02) throw new Error('not an EIP-1559 transaction');
  const f = rlpDecode(raw.slice(1));
  if (!Array.isArray(f) || f.length !== 9) throw new Error('unexpected unsigned transaction shape');
  const b = (i: number): Uint8Array => {
    const x = f[i];
    if (!(x instanceof Uint8Array)) throw new Error(`field ${i} is not a string`);
    return x;
  };
  const n = (i: number): bigint => (b(i).length ? BigInt(`0x${toHex(b(i))}`) : 0n);
  if (b(5).length !== 20) throw new Error('bad recipient length');
  if (b(7).length !== 0 || !Array.isArray(f[8]) || f[8].length !== 0) throw new Error('desk transactions carry no data or access list');
  return {
    chainId: n(0),
    nonce: n(1),
    maxPriorityFeePerGas: n(2),
    maxFeePerGas: n(3),
    gasLimit: n(4),
    to: `0x${toHex(b(5))}`,
    valueWei: n(6),
  };
}
