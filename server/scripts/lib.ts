// Shared helpers for local scripts (Node only). Never prints or stores private keys in the repo.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Rpc, DEFAULT_RPC_URLS } from '../src/near/rpc.js';
import { parseSecretKey, type KeyPair } from '../src/near/keys.js';

export const REPO = new URL('../../', import.meta.url).pathname;
export const SECRETS_DIR = join(homedir(), '.lowball-secrets');

export interface Deployed {
  contractId: string;
  houseId: string;
}

/** Read contract/deployed.json, tolerating a few field spellings. */
export function loadDeployed(): Deployed {
  const p = join(REPO, 'contract/deployed.json');
  if (!existsSync(p)) throw new Error('contract/deployed.json does not exist yet (contract not deployed)');
  const j = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.map((k) => j[k]).find((v) => typeof v === 'string') as string | undefined;
  const contractId = pick('contractId', 'contract_id', 'contract', 'contractAccount', 'contract_account');
  const houseId = pick('houseAccountId', 'house_account_id', 'houseId', 'house_id', 'house', 'houseAccount', 'house_account', 'owner');
  if (!contractId || !houseId) throw new Error(`deployed.json is missing contract/house ids (keys: ${Object.keys(j).join(', ')})`);
  return { contractId, houseId };
}

/** NEAR CLI credential file for an account on testnet: ~/.near-credentials/testnet/<id>.json */
export function loadNearCredential(accountId: string): KeyPair {
  const p = join(homedir(), '.near-credentials', 'testnet', `${accountId}.json`);
  if (!existsSync(p)) throw new Error(`no NEAR credentials for ${accountId} at ${p}`);
  const j = JSON.parse(readFileSync(p, 'utf8')) as { private_key?: string; secret_key?: string };
  const sk = j.private_key ?? j.secret_key;
  if (!sk) throw new Error(`credential file for ${accountId} has no private key`);
  return parseSecretKey(sk);
}

export function makeRpc(): Rpc {
  const urls = process.env.RPC_URLS ? process.env.RPC_URLS.split(',') : DEFAULT_RPC_URLS;
  return new Rpc({ urls });
}
