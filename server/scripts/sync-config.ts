// Copies public deployment facts into src/generated/ so the Worker bundle carries them:
//   contract/deployed.json -> src/generated/config.json   (contract + house account ids; no keys)
//   audio/voices.json      -> src/generated/voices.json
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, loadDeployed } from './lib.js';

const gen = new URL('../src/generated/', import.meta.url).pathname;

const voices = join(REPO, 'audio/voices.json');
if (existsSync(voices)) {
  copyFileSync(voices, join(gen, 'voices.json'));
  process.stdout.write('synced voices.json\n');
} else {
  process.stdout.write('audio/voices.json not found: keeping the existing copy\n');
}

try {
  const d = loadDeployed();
  writeFileSync(join(gen, 'config.json'), JSON.stringify({ contractId: d.contractId, houseAccountId: d.houseId, networkId: 'testnet' }, null, 2) + '\n');
  process.stdout.write(`synced config.json: contract ${d.contractId}, house ${d.houseId}\n`);
} catch (e) {
  process.stdout.write(`config.json not updated: ${(e as Error).message}\n`);
  process.exitCode = 1;
}
