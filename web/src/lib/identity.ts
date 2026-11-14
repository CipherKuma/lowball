import { useEffect, useSyncExternalStore } from 'react';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { ApiFailure, api } from './api';
import {
  connectedWallet,
  fromB64,
  getConnector,
  isTestnetAccount,
  looksRejected,
  signatureToB64,
  withKeyPrefix,
} from './near-connect';
import { getIdentity, initialIdentity, readSession, setIdentity, subscribeIdentity, writeSession, type IdentityState } from './identity/store';

export type { IdentityKind, IdentityState, IdentityStatus } from './identity/store';

const MAINNET_MSG = 'That looks like a mainnet account. Lowball runs on NEAR testnet: switch your wallet to a testnet account.';

function friendly(e: unknown): string {
  if (e instanceof ApiFailure) {
    switch (e.code) {
      case 'AUTH_NOT_FULL_ACCESS':
        return 'That wallet key cannot sign in here. Use a testnet account that holds a full-access key.';
      case 'AUTH_NONCE_EXPIRED':
      case 'AUTH_NONCE_USED':
      case 'AUTH_NONCE_UNKNOWN':
        return 'The sign-in challenge expired. Try again.';
      case 'NETWORK':
        return e.message;
      default:
        return e.message;
    }
  }
  if (looksRejected(e)) return 'You closed the wallet before signing. Nothing was sent. Try again when you are ready.';
  return e instanceof Error && e.message ? `The wallet did not answer: ${e.message}` : 'The wallet did not answer. Try again.';
}

async function signIn(wallet: NearWalletBase, signed: { accountId: string; publicKey: string; signature: string }, n: { nonce: string; recipient: string; message: string }) {
  if (!isTestnetAccount(signed.accountId)) {
    await dropWallet(wallet);
    throw new Error(MAINNET_MSG);
  }
  const r = await api.authVerify({
    accountId: signed.accountId,
    publicKey: withKeyPrefix(signed.publicKey),
    signature: signatureToB64(signed.signature),
    nonce: n.nonce,
    recipient: n.recipient,
    message: n.message,
  });
  writeSession({ token: r.token, accountId: r.accountId, expiresAt: r.expiresAt });
  setIdentity({ status: 'ready', kind: 'wallet', accountId: r.accountId, error: null, walletConnected: true });
}

async function dropWallet(wallet: NearWalletBase | null) {
  try {
    const c = await getConnector();
    await c.disconnect(wallet ?? undefined);
  } catch {
    /* already gone */
  }
}

let busy = false;

/** Opens the wallet selector (or reuses a connected wallet), signs the NEP-413 challenge, trades it for a session. */
export async function connectWallet(): Promise<void> {
  if (busy) return;
  busy = true;
  setIdentity({ status: 'connecting', error: null });
  try {
    const challenge = await api.authNonce();
    const params = { message: challenge.message, recipient: challenge.recipient, nonce: fromB64(challenge.nonce) };
    const existing = await connectedWallet();
    if (existing && isTestnetAccount(existing.accountId)) {
      setIdentity({ status: 'signing' });
      const signed = await existing.wallet.signMessage({ ...params, signerId: existing.accountId });
      await signIn(existing.wallet, signed, challenge);
      return;
    }
    if (existing) await dropWallet(existing.wallet); // a mainnet account left over: start clean
    const c = await getConnector();
    let signed: { accountId: string; publicKey: string; signature: string } | null = null;
    const onSigned = (t: { accounts: { accountId: string; signedMessage: { publicKey: string; signature: string; accountId: string } }[] }) => {
      const a = t.accounts[0];
      if (a) signed = { accountId: a.accountId, publicKey: a.signedMessage.publicKey, signature: a.signedMessage.signature };
    };
    c.on('wallet:signInAndSignMessage', onSigned);
    try {
      const wallet = await c.connect({ signMessageParams: params });
      if (!signed) throw new Error('The wallet signed in but did not sign the message.');
      await signIn(wallet, signed, challenge);
    } finally {
      c.off('wallet:signInAndSignMessage', onSigned);
    }
  } catch (e) {
    const rejected = looksRejected(e);
    const wc = await connectedWallet();
    setIdentity({ status: rejected ? 'idle' : 'error', kind: null, accountId: null, error: friendly(e), walletConnected: !!wc });
  } finally {
    busy = false;
  }
}

export function playAsGuest() {
  setIdentity({ status: 'ready', kind: 'guest', accountId: null, error: null });
}

export async function disconnect(): Promise<void> {
  const s = readSession();
  if (s) await api.authLogout(s.token).catch(() => undefined);
  writeSession(null);
  await dropWallet(null);
  setIdentity({ ...initialIdentity });
}

/** The API session for wallet calls; a lapsed or foreign one drops the identity and throws a friendly error. */
export async function walletAuth(): Promise<{ token: string; accountId: string; wallet: NearWalletBase }> {
  const s = readSession();
  const w = await connectedWallet();
  if (!s || s.expiresAt <= Date.now() + 30_000 || !w) {
    expireSession(s && s.expiresAt <= Date.now() + 30_000 ? 'Your sign-in expired. Sign in with your wallet again.' : 'Your wallet is not connected. Connect it again.', !!w);
    throw new Error(getIdentity().error ?? 'Sign in again.');
  }
  if (w.accountId !== s.accountId) {
    expireSession(`Your wallet switched to ${w.accountId}. Sign in again to play as that account.`, true);
    throw new Error(getIdentity().error ?? 'Sign in again.');
  }
  return { token: s.token, accountId: s.accountId, wallet: w.wallet };
}

/** Server said 401, the token ran out, or the wallet changed: back to idle (wallet stays connected for a quick re-sign). */
export function expireSession(message: string, walletConnected: boolean) {
  writeSession(null);
  setIdentity({ status: 'idle', kind: null, accountId: null, error: message, walletConnected });
}

/** Restore on reload: a still-valid session for the still-connected wallet is ready without any prompt. */
let restored = false;
async function restore() {
  if (restored) return;
  restored = true;
  try {
    const c = await getConnector();
    c.on('wallet:signOut', () => {
      writeSession(null);
      if (getIdentity().kind === 'wallet') setIdentity({ ...initialIdentity });
    });
    const s = readSession();
    const w = await connectedWallet();
    if (!w) {
      writeSession(null);
      return;
    }
    if (!isTestnetAccount(w.accountId)) {
      await dropWallet(w.wallet);
      setIdentity({ error: MAINNET_MSG });
      return;
    }
    if (s && s.accountId === w.accountId && s.expiresAt > Date.now()) {
      try {
        await api.authMe(s.token);
        setIdentity({ status: 'ready', kind: 'wallet', accountId: s.accountId, walletConnected: true });
        return;
      } catch {
        /* token revoked or the network is down: fall through to re-sign */
      }
    }
    writeSession(null);
    setIdentity({ walletConnected: true, accountId: null });
  } catch {
    /* no wallet: stay idle */
  }
}

/** Account switching inside the wallet: checked whenever the tab regains focus. */
async function checkAccount() {
  const st = getIdentity();
  if (st.kind !== 'wallet' || !st.accountId) return;
  const w = await connectedWallet();
  if (!w) {
    expireSession('Your wallet disconnected.', false);
  } else if (w.accountId !== st.accountId) {
    expireSession(`Your wallet switched to ${w.accountId}. Sign in again to play as that account.`, true);
  }
}

export interface UseIdentity extends IdentityState {
  connectWallet: () => Promise<void>;
  playAsGuest: () => void;
  disconnect: () => Promise<void>;
}

const actions = { connectWallet, playAsGuest, disconnect };

export function useIdentity(): UseIdentity {
  const s = useSyncExternalStore(subscribeIdentity, getIdentity, getIdentity);
  useEffect(() => {
    void restore();
    const onFocus = () => void checkAccount();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  return { ...s, ...actions };
}
