// Identity store: one module-level state; the API session is persisted in localStorage (every access guarded).
export type IdentityStatus = 'idle' | 'connecting' | 'signing' | 'ready' | 'error';
export type IdentityKind = 'guest' | 'wallet' | null;

export interface IdentityState {
  status: IdentityStatus;
  kind: IdentityKind;
  accountId: string | null;
  error: string | null;
  /** a wallet is connected but has no valid API session yet (reload after expiry, or a failed signature) */
  walletConnected: boolean;
  /** the player's own 0x address when they signed in with Ethereum Wallets (account id == address), else null; default the payout to it */
  evmAddress: string | null;
}

export const initialIdentity: IdentityState = { status: 'idle', kind: null, accountId: null, error: null, walletConnected: false, evmAddress: null };

let state: IdentityState = initialIdentity;
const listeners = new Set<() => void>();
export const getIdentity = () => state;
export function setIdentity(patch: Partial<IdentityState>) {
  const next = { ...state, ...patch };
  next.evmAddress = next.kind === 'wallet' && next.accountId && /^0x[0-9a-f]{40}$/.test(next.accountId) ? next.accountId : null;
  state = next;
  listeners.forEach((l) => l());
}
export function subscribeIdentity(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const STORE_KEY = 'lowball.auth.v1';
export interface StoredSession {
  token: string;
  accountId: string;
  expiresAt: number;
}
let memo: StoredSession | null = null;
export function readSession(): StoredSession | null {
  if (memo) return memo;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}
export function writeSession(t: StoredSession | null) {
  memo = t;
  try {
    if (t) localStorage.setItem(STORE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* private mode: the session lives in memory for this tab */
  }
}
