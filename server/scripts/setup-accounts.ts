// One-time (idempotent) setup of the five buyer subaccounts of the house.
//  - creates marlow|odile|sully|ines|deacon.<house> funded from the house balance
//  - generates each buyer's NEAR key and a separate ed25519 pact key
//  - calls register_buyer_key (signed by the buyer) with the pact public key
//  - stores the secret keys ONLY in ~/.lowball-secrets/<contract>.json (mode 600), never in the repo
//  - prints the wrangler commands that pipe the secrets in over stdin (no values are printed)
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { RealChain } from '../src/chain/real.js';
import { nearToYocto, yoctoToNear, type BuyerKeys } from '../src/near/accounts.js';
import { toB64 } from '../src/near/bytes.js';
import { formatPublicKey, formatSecretKey, generateKeyPair, parseSecretKey } from '../src/near/keys.js';
import { RpcError } from '../src/near/rpc.js';
import { NearSigner } from '../src/near/signer.js';
import { SECRETS_DIR, loadDeployed, loadNearCredential, makeRpc } from './lib.js';

const FUND = nearToYocto(process.env.BUYER_FUND_NEAR ?? '0.6');
const out = (s: string) => process.stdout.write(s + '\n');

async function accountExists(rpc: ReturnType<typeof makeRpc>, id: string): Promise<boolean> {
  try {
    await rpc.call('query', { request_type: 'view_account', finality: 'optimistic', account_id: id });
    return true;
  } catch (e) {
    if (e instanceof RpcError) return false;
    throw e;
  }
}

async function main() {
  const { contractId, houseId } = loadDeployed();
  const rpc = makeRpc();
  const houseKey = loadNearCredential(houseId);
  const house = new NearSigner({ accountId: houseId, keyPair: houseKey, rpc });

  mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  const file = join(SECRETS_DIR, `${contractId}.json`);
  const saved: Partial<Record<BuyerId, { nearKey: string; pactKey: string }>> = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : {};

  const bal = await new RealChain({ rpc, contractId, houseId, houseKey: formatSecretKey(houseKey), buyerKeys: {} as Record<BuyerId, BuyerKeys> }).houseBalance();
  out(`house ${houseId} balance: ${yoctoToNear(bal)} NEAR; contract ${contractId}`);

  for (const id of BUYER_IDS) {
    const accountId = `${id}.${houseId}`;
    let entry = saved[id];
    const exists = await accountExists(rpc, accountId);
    if (exists && !entry) throw new Error(`${accountId} exists but its keys are not in ${file}; pick another house or restore the file`);
    if (!entry) {
      const near = generateKeyPair();
      const pact = generateKeyPair();
      entry = { nearKey: formatSecretKey(near), pactKey: formatSecretKey(pact) };
      saved[id] = entry;
      writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
      chmodSync(file, 0o600);
    }
    if (!exists) {
      const r = await house.send(accountId, [
        { kind: 'createAccount' },
        { kind: 'transfer', deposit: FUND },
        { kind: 'addKeyFullAccess', publicKey: publicOf(entry.nearKey) },
      ]);
      if (!r.ok) throw new Error(`create ${accountId} failed: ${r.errorCode} ${r.failure ?? ''}`);
      out(`created ${accountId} (${yoctoToNear(FUND)} NEAR) tx ${r.hash}`);
    } else {
      out(`exists  ${accountId}`);
    }
    const buyer = new NearSigner({ accountId, keyPair: parseKey(entry.nearKey), rpc });
    const pactPk = parseKey(entry.pactKey).publicKey;
    const have = await view(rpc, contractId, 'get_buyer_key', { account: accountId });
    if (have === toB64(pactPk)) {
      out(`  pact key already registered`);
      continue;
    }
    const reg = await buyer.send(contractId, [
      { kind: 'functionCall', method: 'register_buyer_key', args: new TextEncoder().encode(JSON.stringify({ public_key: toB64(pactPk) })), gas: 30n * 10n ** 12n, deposit: 0n },
    ]);
    if (!reg.ok) throw new Error(`register_buyer_key ${accountId} failed: ${reg.errorCode} ${reg.failure ?? ''}`);
    out(`  registered pact key ${formatPublicKey(pactPk)} tx ${reg.hash}`);
  }

  out('\nSecrets are in ' + file + ' (mode 600). Push them to the Worker (values never printed):');
  out(`  cd server`);
  out(`  jq -c . ${file} | npx wrangler secret put BUYER_KEYS_JSON`);
  out(`  jq -r .private_key ~/.near-credentials/testnet/${houseId}.json | npx wrangler secret put HOUSE_PRIVATE_KEY`);
  out(`  ~/.claude/vault/inject.sh get NEARAI_API_KEY ELEVENLABS_API_KEY --dir .   # then pipe each into: npx wrangler secret put NAME`);
  out(`For wrangler dev, copy the same names into server/.dev.vars (gitignored).`);
}

const parseKey = parseSecretKey;
const publicOf = (sk: string) => formatPublicKey(parseSecretKey(sk).publicKey);

async function view(rpc: ReturnType<typeof makeRpc>, contractId: string, method: string, args: unknown): Promise<string | null> {
  const r: any = await rpc.call('query', {
    request_type: 'call_function', finality: 'optimistic', account_id: contractId, method_name: method,
    args_base64: toB64(new TextEncoder().encode(JSON.stringify(args))),
  });
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(r.result)));
}

main().catch((e) => {
  process.stderr.write(`setup-accounts failed: ${(e as Error).message}\n`);
  process.exit(1);
});
