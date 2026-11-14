import { ed25519 } from '@noble/curves/ed25519';
import { TESTNET_RPCS } from './wallet';

/**
 * Re-runs the contract's pact check in the browser: for each signer, fetch the ed25519 key the Lowball
 * contract holds for them (`get_buyer_key`) and verify the signature over the exact signed bytes.
 */
export interface SigResult {
  signer: string;
  ok: boolean;
  note?: string;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function viewBuyerKey(contractId: string, account: string): Promise<string | null> {
  const args = btoa(JSON.stringify({ account }));
  for (const url of TESTNET_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'k',
          method: 'query',
          params: { request_type: 'call_function', finality: 'final', account_id: contractId, method_name: 'get_buyer_key', args_base64: args },
        }),
      });
      const j = (await res.json()) as { result?: { result?: number[] } };
      if (!j.result?.result) continue;
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(j.result.result))) as string | null;
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

export async function recheckPact(
  contractId: string,
  messageHex: string,
  signatures: { signer: string; signatureB64: string }[],
): Promise<SigResult[]> {
  const msg = hexToBytes(messageHex);
  return Promise.all(
    signatures.map(async ({ signer, signatureB64 }) => {
      const key = await viewBuyerKey(contractId, signer);
      if (!key) return { signer, ok: false, note: 'no key on the contract' };
      try {
        const ok = ed25519.verify(b64ToBytes(signatureB64), msg, b64ToBytes(key));
        return ok ? { signer, ok } : { signer, ok, note: 'does not match the key the contract holds now (rotated?)' };
      } catch {
        return { signer, ok: false, note: 'malformed signature or key' };
      }
    }),
  );
}
