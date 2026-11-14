// Verifies an ed25519 signature offline (Node crypto, no dependencies).
//   node verify.mjs <public_key_hex> <message_hex|utf8:text> <signature_b64>
// Exit 0 and prints VALID, or exit 1 and prints INVALID.
import { createPublicKey, verify } from 'node:crypto';

const [pkHex, msgArg, sigB64] = process.argv.slice(2);
if (!pkHex || !msgArg || !sigB64) {
  console.error('usage: node verify.mjs <public_key_hex> <message_hex|utf8:text> <signature_b64>');
  process.exit(2);
}
const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const key = createPublicKey({ key: Buffer.concat([spkiPrefix, Buffer.from(pkHex, 'hex')]), format: 'der', type: 'spki' });
const msg = msgArg.startsWith('utf8:') ? Buffer.from(msgArg.slice(5), 'utf8') : Buffer.from(msgArg, 'hex');
const ok = verify(null, msg, key, Buffer.from(sigB64, 'base64'));
console.log(ok ? 'VALID' : 'INVALID');
process.exit(ok ? 0 : 1);
