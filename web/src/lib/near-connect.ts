import type { NearConnector, NearWalletBase } from '@hot-labs/near-connect';
import { TESTNET_RPCS } from './wallet';

/**
 * Thin wrapper over NEAR Connect (@hot-labs/near-connect). The connector is built lazily so nothing touches
 * window/IndexedDB until the player actually uses a wallet. Testnet only: a mainnet account is refused.
 */
let connector: NearConnector | null = null;

export async function getConnector(): Promise<NearConnector> {
  if (connector) return connector;
  const { NearConnector } = await import('@hot-labs/near-connect');
  connector = new NearConnector({
    network: 'testnet',
    providers: { testnet: TESTNET_RPCS }, // sandboxed executors (Meteor, ...) read through these; FastNEAR alone rate-limits
    // no feature filter: Ethereum Wallets (0x accounts) cannot signMessage and sign in through EIP-191 instead
  });
  await connector.whenManifestLoaded.catch(() => undefined);
  return connector;
}

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    let carry = ALPHABET.indexOf(ch);
    if (carry < 0) throw new Error('bad base58');
    for (let i = 0; i < out.length; i++) {
      carry += out[i]! * 58;
      out[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      out.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch !== '1') break;
    out.push(0);
  }
  return Uint8Array.from(out.reverse());
}
export const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** NEP-413 says base64; a few wallets answer "ed25519:<base58>". The server wants base64. */
export function signatureToB64(sig: string): string {
  const raw = sig.startsWith('ed25519:') ? toB64(base58Decode(sig.slice(8))) : sig;
  return raw.replace(/-/g, '+').replace(/_/g, '/');
}
export const withKeyPrefix = (pk: string) => (pk.includes(':') ? pk : `ed25519:${pk}`);

/** Testnet accounts: *.testnet, 64-hex implicit, 0x-implicit. Anything else (e.g. *.near) is mainnet. */
export function isTestnetAccount(id: string): boolean {
  return /\.testnet$/.test(id) || /^[0-9a-f]{64}$/.test(id) || /^0x[0-9a-f]{40}$/.test(id);
}

export class WalletRejected extends Error {}
export const looksRejected = (e: unknown) =>
  /reject|cancel|denied|declin|closed|abort|user (did not|didn't)/i.test(e instanceof Error ? e.message : String(e));

export async function connectedWallet(): Promise<{ wallet: NearWalletBase; accountId: string } | null> {
  try {
    const c = await getConnector();
    const { wallet, accounts } = await c.getConnectedWallet();
    return accounts[0] ? { wallet, accountId: accounts[0].accountId } : null;
  } catch {
    return null;
  }
}

/** offer_leniency from the player's wallet. May never resolve before the yield times out: race it. */
export function sendOfferLeniency(wallet: NearWalletBase, signerId: string, contractId: string, seasonId: number) {
  return wallet.signAndSendTransaction({
    signerId,
    receiverId: contractId,
    actions: [
      { type: 'FunctionCall', params: { methodName: 'offer_leniency', args: { season_id: seasonId }, gas: '30000000000000', deposit: '0' } },
    ],
  });
}

/** get_season view straight from testnet RPC. */
export async function viewSeason(contractId: string, seasonId: number): Promise<{ leniency_open: boolean; player: string } | null> {
  const args = btoa(JSON.stringify({ season_id: seasonId }));
  for (const url of TESTNET_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'optimistic', account_id: contractId, method_name: 'get_season', args_base64: args } }),
      });
      const j = (await res.json()) as { result?: { result?: number[]; error?: string } };
      if (j.result?.result) return JSON.parse(new TextDecoder().decode(Uint8Array.from(j.result.result)));
    } catch {
      /* next endpoint */
    }
  }
  return null;
}

export const isEvmAccount = (id: string) => /^0x[0-9a-f]{40}$/.test(id);

/** Wallet picker with every testnet manifest wallet listed (connect() would hide the ones without signInAndSignMessage). */
export async function pickWallet(): Promise<{ walletId: string; features: Record<string, boolean | undefined> }> {
  const c = await getConnector();
  const walletId = await c.selectWallet({});
  const m = c.availableWallets.find((w) => w.manifest.id === walletId)?.manifest;
  return { walletId, features: (m?.features ?? {}) as Record<string, boolean | undefined> };
}
