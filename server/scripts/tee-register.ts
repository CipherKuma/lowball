// Registers each buyer's enclave (TEE-derived) ed25519 key on the game contract, from the buyer's own account,
// then reads get_buyer_key back. Keys come from ~/.lowball-secrets/<contract>.json (never printed).
//   npm run tee-register                 register the enclave keys (re-run safe: skips buyers whose key already matches)
//   npm run tee-register -- --server-keys  put the server-held pact keys back (for TEE_BUYERS=0); a contract holds
//                                          one key per buyer, so the two modes exclude each other on one deployment
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUYER_IDS } from '../../shared/api.js';
import { parseBuyerKeys } from '../src/near/accounts.js';
import { toB64, utf8 } from '../src/near/bytes.js';
import { NearSigner } from '../src/near/signer.js';
import type { TeeDeployment } from '../src/tee/types.js';
import { REPO, SECRETS_DIR, loadDeployed, makeRpc } from './lib.js';

const out = (s: string) => process.stdout.write(s + '\n');
const deployment = JSON.parse(readFileSync(join(REPO, 'outlayer/deployed.json'), 'utf8')) as TeeDeployment;
const { contractId, houseId } = loadDeployed();
const rpc = makeRpc();
const keys = parseBuyerKeys(readFileSync(join(SECRETS_DIR, `${contractId}.json`), 'utf8'));

async function registered(account: string): Promise<string | null> {
  const r = await rpc.call('query', {
    request_type: 'call_function', finality: 'final', account_id: contractId, method_name: 'get_buyer_key',
    args_base64: toB64(utf8(JSON.stringify({ account }))),
  });
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(r.result)));
}

const serverKeys = process.argv.includes('--server-keys');
let bad = 0;
for (const b of BUYER_IDS) {
  const account = `${b}.${houseId}`;
  const want = serverKeys ? toB64(keys[b].pact.publicKey) : deployment.buyers[b].publicKeyB64;
  if (!want) throw new Error(`${b}: no TEE key in outlayer/deployed.json (run npm run tee-probe)`);
  if ((await registered(account)) === want) {
    out(`${b}: already registered`);
    continue;
  }
  const signer = new NearSigner({ accountId: account, keyPair: keys[b].near, rpc });
  const r = await signer.send(contractId, [
    { kind: 'functionCall', method: 'register_buyer_key', args: utf8(JSON.stringify({ public_key: want })), gas: 30n * 10n ** 12n, deposit: 0n },
  ]);
  const now = await registered(account);
  const ok = r.ok && now === want;
  if (!ok) bad++;
  out(`${b}: ${ok ? 'registered' : 'FAILED ' + (r.errorCode ?? '')} tx=${r.hash} key=${want}`);
}
if (bad) process.exit(1);
