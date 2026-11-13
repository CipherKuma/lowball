import { z } from 'zod';
import { BUYER_IDS, type BuyerId } from '../../../shared/api.js';
import { parseSecretKey, type KeyPair } from './keys.js';

const BuyerKeysSchema = z.record(
  z.enum(BUYER_IDS),
  z.object({ nearKey: z.string(), pactKey: z.string() }),
);

export interface BuyerKeys {
  near: KeyPair;
  pact: KeyPair;
}

/** Parse the BUYER_KEYS_JSON secret: { marlow: { nearKey, pactKey }, ... } (all 5 required). */
export function parseBuyerKeys(json: string): Record<BuyerId, BuyerKeys> {
  const raw = BuyerKeysSchema.parse(JSON.parse(json));
  const out = {} as Record<BuyerId, BuyerKeys>;
  for (const id of BUYER_IDS) {
    const k = raw[id];
    if (!k) throw new Error(`BUYER_KEYS_JSON missing ${id}`);
    out[id] = { near: parseSecretKey(k.nearKey), pact: parseSecretKey(k.pactKey) };
  }
  return out;
}

export function buyerAccountId(id: BuyerId, house: string): string {
  return `${id}.${house}`;
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function randomPlayerAccount(house: string): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  let s = 'p';
  for (const x of b) s += ALNUM[x % ALNUM.length];
  return `${s}.${house}`;
}

export const NEAR = 10n ** 24n;
export function nearToYocto(n: string | number): bigint {
  const [whole, frac = ''] = String(n).split('.');
  return BigInt(whole || '0') * NEAR + BigInt((frac + '0'.repeat(24)).slice(0, 24));
}
export function yoctoToNear(y: bigint | string, digits = 3): string {
  const v = BigInt(y);
  const whole = v / NEAR;
  const frac = ((v % NEAR) + NEAR).toString().slice(1).slice(0, digits);
  return `${whole}.${frac}`;
}
