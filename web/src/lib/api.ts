import type {
  ApiError,
  CasefileResponse,
  CreateSessionResponse,
  ErrorCode,
  EventsResponse,
  LeniencyResponse,
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

export const api = {
  createSession: (playerPublicKey: string) =>
    call<CreateSessionResponse>('/api/session', { method: 'POST', body: JSON.stringify({ playerPublicKey }) }),
  events: (id: string, after: number) => call<EventsResponse>(`/api/session/${id}/events?after=${after}`),
  step: (id: string, action: StepAction) =>
    call<StepResponse>(`/api/session/${id}/step`, { method: 'POST', body: JSON.stringify({ action }) }),
  leniency: (id: string, txHash: string) =>
    call<LeniencyResponse>(`/api/session/${id}/leniency`, { method: 'POST', body: JSON.stringify({ txHash }) }),
  casefile: (id: string) => call<CasefileResponse>(`/api/session/${id}/casefile`),
  ttsUrl: (id: string, seq: number) => `${BASE}/api/tts?session=${encodeURIComponent(id)}&seq=${seq}`,
};
