import type {
  ApiError,
  AuthNonceResponse,
  AuthVerifyEvmRequest,
  AuthVerifyRequest,
  AuthVerifyResponse,
  CasefileResponse,
  CreateSessionResponse,
  ErrorCode,
  EventsResponse,
  ForgeResponse,
  LeniencyResponse,
  SeasonSummary,
  StepAction,
  StepResponse,
} from '../../../shared/api';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode | 'NETWORK',
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiFailure('The harbour line is down. Check your connection.', 'NETWORK', 0);
  }
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* non-JSON error */
    }
    throw new ApiFailure(body?.error ?? `Request failed (${res.status})`, body?.code ?? 'INTERNAL', res.status);
  }
  return (await res.json()) as T;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export const api = {
  authNonce: () => call<AuthNonceResponse>('/api/auth/nonce', { method: 'POST', body: '{}' }),
  authVerify: (body: AuthVerifyRequest) =>
    call<AuthVerifyResponse>('/api/auth/verify', { method: 'POST', body: JSON.stringify(body) }),
  authVerifyEvm: (body: AuthVerifyEvmRequest) =>
    call<AuthVerifyResponse>('/api/auth/verify-evm', { method: 'POST', body: JSON.stringify(body) }),
  authMe: (token: string) => call<{ accountId: string }>('/api/auth/me', { headers: bearer(token) }),
  authLogout: (token: string) => call<unknown>('/api/auth/logout', { method: 'POST', body: '{}', headers: bearer(token) }),
  /** wallet season: the signed-in account is the player; nothing is created or funded for it */
  createWalletSession: (token: string, payoutEvm?: string) =>
    call<CreateSessionResponse>('/api/session', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ mode: 'wallet', ...(payoutEvm ? { payoutEvm } : {}) }),
    }),
  createSession: (playerPublicKey: string, payoutEvm?: string) =>
    call<CreateSessionResponse>('/api/session', {
      method: 'POST',
      body: JSON.stringify({ playerPublicKey, ...(payoutEvm ? { payoutEvm } : {}) }),
    }),
  events: (id: string, after: number) => call<EventsResponse>(`/api/session/${id}/events?after=${after}`),
  step: (id: string, action: StepAction) =>
    call<StepResponse>(`/api/session/${id}/step`, { method: 'POST', body: JSON.stringify({ action }) }),
  /** guests send the tx hash; wallet seasons may send none and the server confirms the open window on chain */
  leniency: (id: string, txHash?: string) =>
    call<LeniencyResponse>(`/api/session/${id}/leniency`, { method: 'POST', body: JSON.stringify(txHash ? { txHash } : {}) }),
  casefile: (id: string) => call<CasefileResponse>(`/api/session/${id}/casefile`),
  /** one season's standing (open or closed), to resume it or reopen its case file */
  summary: (id: string) => call<SeasonSummary>(`/api/session/${encodeURIComponent(id)}/summary`),
  /** can the payout desk pay this Sepolia address? (a never-used address needs more gas than the desk signs for) */
  payoutCheck: (to: string) =>
    call<{ ok: boolean; gasNeeded: string; gasLimit: string; reason?: string }>(`/api/payout/check?to=${encodeURIComponent(to)}`),
  /** every season the signed-in wallet played, newest first */
  mySeasons: (token: string) => call<{ seasons: SeasonSummary[] }>('/api/me/seasons', { headers: bearer(token) }),
  ttsUrl: (id: string, seq: number) => `${BASE}/api/tts?session=${encodeURIComponent(id)}&seq=${seq}`,
  wiretapUrl: (id: string) => `${BASE}/api/session/${encodeURIComponent(id)}/wiretap`,
  forge: (id: string) => call<ForgeResponse>(`/api/session/${id}/forge`, { method: 'POST', body: '{}' }),
  interrogate: async (id: string, buyer: string, input: { audio?: Blob; text?: string }) => {
    const form = new FormData();
    form.set('buyer', buyer);
    if (input.audio) {
      const ext = input.audio.type.includes('mp4') ? 'mp4' : input.audio.type.includes('ogg') ? 'ogg' : 'webm';
      form.set('audio', input.audio, `question.${ext}`);
    }
    if (input.text) form.set('text', input.text);
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/session/${id}/interrogate`, { method: 'POST', body: form });
    } catch {
      throw new ApiFailure('The harbour line is down. Check your connection.', 'NETWORK', 0);
    }
    if (!res.ok) {
      let body: ApiError | null = null;
      try {
        body = (await res.json()) as ApiError;
      } catch {
        /* non-JSON error */
      }
      throw new ApiFailure(body?.error ?? `Request failed (${res.status})`, body?.code ?? 'INTERNAL', res.status);
    }
  },
};
