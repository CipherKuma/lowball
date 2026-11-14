import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPair, actions, teraToGas } from 'near-api-js';
import type { KeyPairString } from 'near-api-js';

/**
 * The fisher's throwaway testnet key. Generated in this browser; the server only ever sees the public
 * half, which it installs as a FunctionCall key (offer_leniency only) on the fisher account.
 */
const STORE = 'lowball.fisher.v1';

export const TESTNET_RPCS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
export const EXPLORER = 'https://testnet.nearblocks.io';

export interface FisherKey {
  publicKey: string;
  secretKey: KeyPairString;
}

function read(): FisherKey | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as FisherKey) : null;
  } catch {
    return null;
  }
}

/** A fresh key per season keeps sessions independent. */
export function freshFisherKey(): FisherKey {
  const kp = KeyPair.fromRandom('ed25519');
  const key: FisherKey = { publicKey: kp.getPublicKey().toString(), secretKey: kp.toString() as KeyPairString };
  try {
    localStorage.setItem(STORE, JSON.stringify(key));
  } catch {
    /* private mode: key lives in memory for this tab only */
  }
  memo = key;
  return key;
}

let memo: FisherKey | null = null;
export function currentFisherKey(): FisherKey | null {
  return memo ?? read();
}

function provider() {
  return new FailoverRpcProvider(TESTNET_RPCS.map((url) => new JsonRpcProvider({ url })));
}

/** Signs and sends `offer_leniency` from the fisher account. Returns the tx hash. */
export async function signOfferLeniency(accountId: string, contractId: string, seasonId: number): Promise<string> {
  const key = currentFisherKey();
  if (!key) throw new Error('No fisher key in this browser. Start a new season.');
  const account = new Account(accountId, provider(), key.secretKey);
  const res = await account.signAndSendTransaction({
    receiverId: contractId,
    // offer_leniency opens a NEP-519 yield that stays pending until a confession or the 200-block
    // timeout, so waiting for full execution would hang: wait for inclusion only.
    actions: [actions.functionCall('offer_leniency', { season_id: seasonId }, teraToGas(30), 0n)],
    waitUntil: 'INCLUDED_FINAL',
  });
  return res.transaction.hash;
}

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;

export function yoctoToNear(yocto: string, digits = 2): string {
  const y = BigInt(yocto || '0');
  const whole = y / 10n ** 24n;
  const frac = (y % 10n ** 24n).toString().padStart(24, '0').slice(0, digits);
  return digits > 0 ? `${whole}.${frac}` : whole.toString();
}
