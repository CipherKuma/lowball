// Minimal RLP encoder/decoder (enough for an EIP-1559 transaction). Pure functions, Worker-safe.
import { concat } from '../near/bytes.js';

export type Rlp = Uint8Array | Rlp[];

export function uintBytes(v: bigint): Uint8Array {
  if (v < 0n) throw new Error('negative integer');
  if (v === 0n) return new Uint8Array(0);
  let h = v.toString(16);
  if (h.length % 2) h = `0${h}`;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function prefix(len: number, short: number, long: number): Uint8Array {
  if (len <= 55) return Uint8Array.of(short + len);
  const l = uintBytes(BigInt(len));
  return concat(Uint8Array.of(long + l.length), l);
}

export function rlpEncode(item: Rlp): Uint8Array {
  if (item instanceof Uint8Array) {
    if (item.length === 1 && item[0]! < 0x80) return item;
    return concat(prefix(item.length, 0x80, 0xb7), item);
  }
  const payload = concat(...item.map(rlpEncode));
  return concat(prefix(payload.length, 0xc0, 0xf7), payload);
}

/** Decode one RLP item (strings and lists). Used to cross-check the contract's unsigned tx. */
export function rlpDecode(buf: Uint8Array): Rlp {
  const [item, end] = decodeAt(buf, 0);
  if (end !== buf.length) throw new Error('trailing bytes after RLP item');
  return item;
}

function readLen(buf: Uint8Array, at: number, n: number): number {
  if (at + n > buf.length) throw new Error('RLP truncated');
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + buf[at + i]!;
  return v;
}

function decodeAt(buf: Uint8Array, at: number): [Rlp, number] {
  const b = buf[at];
  if (b === undefined) throw new Error('RLP truncated');
  if (b < 0x80) return [buf.slice(at, at + 1), at + 1];
  const isList = b >= 0xc0;
  const base = isList ? 0xc0 : 0x80;
  let len: number;
  let start: number;
  if (b - base <= 55) {
    len = b - base;
    start = at + 1;
  } else {
    const n = b - base - 55;
    len = readLen(buf, at + 1, n);
    start = at + 1 + n;
  }
  const end = start + len;
  if (end > buf.length) throw new Error('RLP truncated');
  if (!isList) return [buf.slice(start, end), end];
  const items: Rlp[] = [];
  let p = start;
  while (p < end) {
    const [it, next] = decodeAt(buf, p);
    items.push(it);
    p = next;
  }
  return [items, end];
}
