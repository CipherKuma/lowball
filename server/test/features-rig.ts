// Shared rig for the BRIEF-3 route tests: real Hono app, in-memory chain/store, scripted buyer model, faked ElevenLabs.
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { AppError } from '../src/errors.js';
import { createSession, step } from '../src/game/engine.js';
import type { CompleteRequest, CompleteResult } from '../src/llm/types.js';
import { DEFAULT_POLICY, makeRig, PLAYER_PK, ScriptedLlm } from './helpers.js';


/** The scripted buyer model plus an `interrogate` answer (the shared helper predates that call kind). */
export class FeatureLlm extends ScriptedLlm {
  prompts: string[] = [];
  failInterrogate = false;
  next = { say: 'You are barking at the wrong dog, fisher.', mood: 'tense', pressure: 2, tell: 'Thumb worrying the ledger edge.' };
  override async complete<T>(req: CompleteRequest<T>): Promise<CompleteResult<T>> {
    if (req.kind !== 'interrogate') return super.complete(req);
    this.calls.push({ buyer: req.buyer, kind: req.kind });
    if (this.failInterrogate) throw new AppError('MODEL_UNAVAILABLE');
    this.prompts.push(req.user);
    const value = req.schema.parse(this.next);
    const base = await super.complete({ ...req, kind: 'react', schema: { parse: (x: unknown) => x } as never });
    return { value, chatId: 'chatcmpl-interrogate', receipt: base.receipt.then((r) => ({ ...r, kind: 'interrogate' as const, chatId: 'chatcmpl-interrogate' })) };
  }
}

export interface Upstream {
  stt: number;
  dialogue: number;
  tts: number;
  lastDialogue: { inputs: { text: string; voice_id: string }[]; model_id: string; audio_effects?: Record<string, unknown> } | null;
  lastTts: { text: string; model_id: string; voice_settings?: { stability: number } } | null;
  sttKeyterms: string[];
  sttText: string | null; // null: the call fails
  words?: { end: number }[];
}

export function rig(policy: Parameters<typeof makeRig>[0] = {}) {
  const r = makeRig(policy);
  const llm = new FeatureLlm({ ...DEFAULT_POLICY, ...policy });
  r.deps.llm = llm;
  const up: Upstream = { stt: 0, dialogue: 0, tts: 0, lastDialogue: null, lastTts: null, sttKeyterms: [], sttText: 'Where were you on Tuesday night, Marlow?' };
  const store: Record<string, Response> = {};
  const cache = { match: async (q: Request) => store[q.url]?.clone(), put: async (q: Request, res: Response) => void (store[q.url] = res.clone()) };
  const fetchFn = (async (url: string, init: { body: FormData | string }) => {
    if (url.includes('speech-to-text')) {
      up.stt++;
      const f = init.body as FormData;
      expect(f.get('model_id')).toBe('scribe_v3');
      up.sttKeyterms = f.getAll('keyterms') as string[];
      expect(f.get('file')).toBeTruthy();
      if (up.sttText === null) return new Response('no', { status: 500 });
      return new Response(JSON.stringify({ text: up.sttText, language_code: 'eng', words: up.words ?? [{ end: 3.2 }] }), { status: 200 });
    }
    if (url.includes('text-to-dialogue')) {
      up.dialogue++;
      up.lastDialogue = JSON.parse(init.body as string);
      return new Response(new Uint8Array([9, 9, 9]), { status: 200 });
    }
    up.tts++;
    up.lastTts = JSON.parse(init.body as string);
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as unknown as typeof fetch;
  const app = createApp({ deps: () => r.deps, allowedOrigin: () => '*', maxSessionsPerIpHour: () => 99, elevenLabsKey: () => 'xi-test', ttsMaxPerSession: () => 80, cache: () => cache, ttsFetch: fetchFn });
  return { ...r, llm, up, app };
}
export type Rig = ReturnType<typeof rig>;

export async function begun(r: Rig) {
  const c = await createSession(r.deps, PLAYER_PK, '3.3.3.3');
  await step(r.deps, c.sessionId, 'begin');
  return c.sessionId;
}

export function form(fields: Record<string, string | Blob>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v as never);
  return f;
}
export const post = (r: Rig, id: string, f: FormData) => r.app.request(`/api/session/${id}/interrogate`, { method: 'POST', body: f });
export const audio = (type = 'audio/webm;codecs=opus', bytes = 4000) => new Blob([new Uint8Array(bytes)], { type });
export const body = async (res: Response) => (await res.json()) as any;
export const asked = (r: Rig) => r.llm.calls.filter((c) => c.kind === 'interrogate').length;
