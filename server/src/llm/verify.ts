// NEAR AI Cloud response-signature verification.
// Spec: https://docs.near.ai/cloud/verification/reference/response-signature-verification.md
//  gateway text      = sha256hex(requestBytes) ":" sha256hex(responseBytes)
//  provider_tee text = modelId ":" sha256hex(req) ":" sha256hex(resp)
//  ecdsa: EIP-191 personal message over the UTF-8 text, recover the signer, compare to the address
//  ed25519: verify over the UTF-8 text with the address as the 32-byte public key
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import type { SignatureVerification } from '../../../shared/api.js';
import { concat, fromHex, toHex, utf8 } from '../near/bytes.js';

export interface SignaturePayload {
  text: string;
  signature: string;
  signing_address: string;
  signing_algo: string;
  signature_kind?: string;
}

export interface PreflightSigner {
  signing_address: string;
  signing_algo: string;
}

export function sha256Hex(b: Uint8Array): string {
  return toHex(sha256(b));
}

/** Ethereum EIP-191 personal-message digest of a UTF-8 message. */
export function eip191Digest(text: string): Uint8Array {
  const body = utf8(text);
  return keccak_256(concat(utf8(`\x19Ethereum Signed Message:\n${body.length}`), body));
}

export function recoverEthAddress(text: string, sigHex: string): string {
  const sig = fromHex(sigHex);
  if (sig.length !== 65) throw new Error('ecdsa signature must be 65 bytes');
  let v = sig[64]!;
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error('bad recovery id');
  const s = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v);
  const pub = s.recoverPublicKey(eip191Digest(text)).toRawBytes(false); // 65 bytes, 0x04 prefix
  return '0x' + toHex(keccak_256(pub.slice(1)).slice(12));
}

function normAddr(a: string): string {
  return a.toLowerCase().replace(/^0x/, '');
}

function constEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function checkSignatureCrypto(p: SignaturePayload): boolean {
  try {
    if (p.signing_algo === 'ecdsa') {
      return constEq(normAddr(recoverEthAddress(p.text, p.signature)), normAddr(p.signing_address));
    }
    if (p.signing_algo === 'ed25519') {
      const sig = fromHex(p.signature);
      const pk = fromHex(p.signing_address);
      if (sig.length !== 64 || pk.length !== 32) return false;
      return ed25519.verify(sig, utf8(p.text), pk);
    }
    return false;
  } catch {
    return false;
  }
}

export interface VerifyInput {
  requestBytes: Uint8Array;
  responseBytes: Uint8Array;
  /** canonical model id as sent in the request (needed for provider_tee text) */
  modelId: string;
  payload: SignaturePayload;
  preflight: PreflightSigner | null;
}

export function verifyReceipt(i: VerifyInput): SignatureVerification {
  const requestHash = sha256Hex(i.requestBytes);
  const responseHash = sha256Hex(i.responseBytes);
  const kind: SignatureVerification['signatureKind'] =
    i.payload.signature_kind === 'provider_tee' || i.payload.signature_kind === 'gateway'
      ? i.payload.signature_kind
      : 'unknown';
  let expected: string | null = null;
  if (kind === 'gateway') expected = `${requestHash}:${responseHash}`;
  else if (kind === 'provider_tee') expected = `${i.modelId}:${requestHash}:${responseHash}`;
  const textMatches = expected !== null && i.payload.text === expected;
  const signatureValid = checkSignatureCrypto(i.payload);
  // The preflight binding applies to gateway signatures. A provider_tee signer would come from a
  // model attestation report, which this server does not fetch; quoteVerified stays false.
  const signerMatchesPreflight =
    kind === 'gateway' &&
    i.preflight !== null &&
    i.preflight.signing_algo === i.payload.signing_algo &&
    constEq(normAddr(i.preflight.signing_address), normAddr(i.payload.signing_address));
  return {
    requestHash,
    responseHash,
    signatureKind: kind,
    signingAlgo: i.payload.signing_algo,
    signingAddress: i.payload.signing_address,
    textMatches,
    signatureValid,
    signerMatchesPreflight,
    quoteVerified: false,
    verified: textMatches && signatureValid && (kind === 'provider_tee' || signerMatchesPreflight),
  };
}

export function failedVerification(requestHash: string, responseHash: string, error: string): SignatureVerification {
  return {
    requestHash,
    responseHash,
    signatureKind: 'unknown',
    signingAlgo: '',
    signingAddress: '',
    textMatches: false,
    signatureValid: false,
    signerMatchesPreflight: false,
    quoteVerified: false,
    verified: false,
    error,
  };
}
