import { sha256 } from '@noble/hashes/sha256';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { toB64, toHex } from '../near/bytes.js';
import { parsePublicKey } from '../near/keys.js';
import { Rpc, RpcError } from '../near/rpc.js';
import type { Store } from '../store/types.js';
import { verifyNep413 } from './nep413.js';

export const NONCE_TTL_MS = 5 * 60_000;
export const TOKEN_TTL_MS = 12 * 3_600_000;
export const SIGN_IN_MESSAGE = 'Sign in to Lowball';
export const DEFAULT_RECIPIENT = 'play.lowball-game.pages.dev';

export interface AuthDeps {
  store: Store;
  rpc: Rpc;
  recipient: string;
  now?: () => number;
}

const B64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
function decodeB64(s: string): Uint8Array | null {
  if (!B64.test(s)) return null;
  try {
    const std = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(std.padEnd(Math.ceil(std.length / 4) * 4, '='));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const b64Field = (max: number) => z.string().min(1).max(max).regex(B64, 'must be base64');

export const VerifySchema = z
  .object({
    accountId: z.string().min(2).max(64).regex(/^[a-z0-9._-]+$/, 'accountId is not a valid NEAR account id'),
    publicKey: z.string().max(100).refine((s) => {
      try {
        parsePublicKey(s);
        return true;
      } catch {
        return false;
      }
    }, 'publicKey must be ed25519:<base58> (32 bytes)'),
    signature: b64Field(100),
    nonce: b64Field(64),
    recipient: z.string().min(1).max(200),
    message: z.string().min(1).max(500),
  })
  .strict();
export type VerifyBody = z.infer<typeof VerifySchema>;

export const tokenHash = (token: string): string => toHex(sha256(new TextEncoder().encode(token)));

const b64url = (b: Uint8Array) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function issueNonce(d: AuthDeps) {
  const now = (d.now ?? Date.now)();
  const nonce = toB64(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = now + NONCE_TTL_MS;
  await d.store.putAuthNonce(nonce, expiresAt);
  return { nonce, recipient: d.recipient, message: SIGN_IN_MESSAGE, expiresAt };
}

const IMPLICIT = /^[0-9a-f]{64}$/;

/** True when `publicKey` is a full access key of `accountId` at final finality (implicit accounts may not exist yet). */
async function hasFullAccess(rpc: Rpc, accountId: string, publicKeyStr: string, publicKey: Uint8Array): Promise<boolean> {
  const implicitMatch = IMPLICIT.test(accountId) && toHex(publicKey) === accountId;
  try {
    const r = await rpc.call('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKeyStr });
    if (r && typeof r === 'object' && typeof r.error === 'string') throw new RpcError(r.error, 'UNKNOWN_ACCESS_KEY', r);
    return r?.permission === 'FullAccess';
  } catch (e) {
    if (!(e instanceof RpcError)) throw e;
    if (!['UNKNOWN_ACCESS_KEY', 'UNKNOWN_ACCOUNT'].includes(e.name_)) throw new AppError('RPC_UNAVAILABLE', 'Could not check the key on chain.');
    if (!implicitMatch) return false;
    // implicit account whose key is not on chain: fine only while the account does not exist at all
    try {
      await rpc.call('query', { request_type: 'view_account', finality: 'final', account_id: accountId });
      return false;
    } catch (e2) {
      if (e2 instanceof RpcError && e2.name_ === 'UNKNOWN_ACCOUNT') return true;
      if (e2 instanceof RpcError) return false;
      throw e2;
    }
  }
}

export async function verifySignIn(d: AuthDeps, body: VerifyBody) {
  const now = (d.now ?? Date.now)();
  if (body.recipient !== d.recipient || body.message !== SIGN_IN_MESSAGE) throw new AppError('AUTH_BAD_RECIPIENT');
  const nonceBytes = decodeB64(body.nonce);
  const sig = decodeB64(body.signature);
  if (!nonceBytes || nonceBytes.length !== 32 || !sig || sig.length !== 64) throw new AppError('BAD_REQUEST', 'nonce must be 32 bytes and signature 64 bytes (base64).');
  const pk = parsePublicKey(body.publicKey);
  if (!verifyNep413({ message: body.message, nonce: nonceBytes, recipient: body.recipient }, sig, pk)) throw new AppError('AUTH_BAD_SIGNATURE');
  // single use: spent atomically right after the signature checks, before any RPC
  const spent = await d.store.consumeAuthNonce(toB64(nonceBytes), now);
  if (spent === 'used') throw new AppError('AUTH_NONCE_USED');
  if (spent === 'expired') throw new AppError('AUTH_NONCE_EXPIRED');
  if (spent === 'unknown') throw new AppError('AUTH_NONCE_UNKNOWN');
  if (!(await hasFullAccess(d.rpc, body.accountId, body.publicKey, pk))) throw new AppError('AUTH_NOT_FULL_ACCESS');
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = now + TOKEN_TTL_MS;
  await d.store.putAuthSession(tokenHash(token), body.accountId, expiresAt);
  return { token, accountId: body.accountId, expiresAt };
}

export function bearerOf(header: string | undefined): string | null {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(header ?? '');
  return m ? m[1]! : null;
}

export async function requireAccount(d: AuthDeps, header: string | undefined): Promise<{ accountId: string; token: string }> {
  const token = bearerOf(header);
  if (!token) throw new AppError('AUTH_REQUIRED');
  const accountId = await d.store.getAuthSession(tokenHash(token), (d.now ?? Date.now)());
  if (!accountId) throw new AppError('AUTH_REQUIRED');
  return { accountId, token };
}
