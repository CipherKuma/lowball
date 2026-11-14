// F3: the fisher corners one buyer in the back room (voice or typed). The buyer answers through the same NEAR AI
// client as every other call, so the exchange carries a signed receipt in the Case File.
import type { BuyerId, InterrogateResponse } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { GameCtx, type GameDeps } from '../game/ctx.js';
import { statusOf } from '../game/engine.js';
import { interrogationPrompt, system } from '../game/prompts.js';
import type { SessionState } from '../game/state.js';
import { INTERROGATE_JSON_SCHEMA, InterrogateOut } from './schemas.js';
import { transcribe, MAX_AUDIO_SECONDS } from './stt.js';

export const MAX_PRESSURE = 6;
const LOCK_MS = 90_000;

export interface InterrogateInput {
  buyer: BuyerId;
  text?: string;
  audio?: Blob;
}

export interface VoiceBudget {
  apiKey: string;
  fetchFn?: typeof fetch;
  /** claim one ElevenLabs call for this session (false: the cap is spent) */
  reserve: () => Promise<boolean>;
  release: () => Promise<void>;
}

/** Every refusal that depends only on state, so it can run before any billed call. */
export function checkInterrogable(s: SessionState): void {
  if (s.phase !== 'lot_open' && s.phase !== 'settled') throw new AppError('BAD_PHASE', 'There is nobody to corner right now.');
  if (s.confessed || s.finalize) throw new AppError('BAD_PHASE', 'The ring has already broken; there is nothing left to squeeze.');
  if ((s.interrogations ?? []).some((i) => i.day === s.day)) {
    throw new AppError('ALREADY_INTERROGATED', 'You have already cornered a buyer today. Come back tomorrow.');
  }
}

/** A question needs at least three words; anything shorter (a cut-off "hey") must not cost the day's one question. */
export const MIN_QUESTION_WORDS = 3;
export const tooShort = (q: string): boolean => q.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length < MIN_QUESTION_WORDS;

export const clampPressure = (n: number): number => Math.max(0, Math.min(MAX_PRESSURE, n));

export async function interrogate(deps: GameDeps, id: string, input: InterrogateInput, voice: VoiceBudget): Promise<InterrogateResponse> {
  const { store } = deps;
  const first = await store.loadState(id);
  if (!first) throw new AppError('NOT_FOUND', 'No such session.');
  checkInterrogable(first);
  if (!(await store.tryLock(id, LOCK_MS))) throw new AppError('BUSY');
  let ctx: GameCtx | null = null;
  try {
    const s = await store.loadState(id);
    if (!s) throw new AppError('NOT_FOUND', 'No such session.');
    checkInterrogable(s); // again under the lock: two requests cannot both pass
    s.seq = Math.max(s.seq, await store.lastSeq(id));

    let question = input.text?.trim() ?? '';
    // typed text: refused before anything billed runs, and nothing has been written yet
    if (!input.audio && tooShort(question)) throw new AppError('TOO_SHORT');
    if (input.audio) {
      if (!(await voice.reserve())) throw new AppError('TTS_LIMIT');
      let t;
      try {
        t = await transcribe(input.audio, voice.apiKey, voice.fetchFn);
      } catch (e) {
        await voice.release();
        throw e;
      }
      if (t.seconds !== null && t.seconds > MAX_AUDIO_SECONDS + 1) throw new AppError('BAD_REQUEST', `Keep it under ${MAX_AUDIO_SECONDS} seconds.`);
      question = t.text.slice(0, 240);
      // a cut-off recording ("hey") is heard but is not a question: the day's one question stays unspent
      if (tooShort(question)) throw new AppError('TOO_SHORT');
    }

    ctx = new GameCtx(id, s, deps);
    const r = await deps.llm.complete({
      buyer: input.buyer,
      kind: 'interrogate',
      day: s.day,
      system: system(input.buyer, s),
      user: interrogationPrompt(input.buyer, s, question),
      schema: InterrogateOut,
      jsonSchema: INTERROGATE_JSON_SCHEMA,
      schemaName: 'interrogation',
      maxTokens: 400,
    });
    ctx.track(r.receipt);
    const pressure = clampPressure((s.pressure?.[input.buyer] ?? 0) + r.value.pressure);
    s.pressure = { ...(s.pressure ?? {}), [input.buyer]: pressure };
    (s.interrogations ??= []).push({ day: s.day, buyer: input.buyer, question, answer: r.value.say, mood: r.value.mood, tell: r.value.tell, pressure });
    const ev = await ctx.emit({ type: 'interrogation', buyer: input.buyer, day: s.day, question, answer: r.value.say, mood: r.value.mood, tell: r.value.tell, pressure });
    await ctx.save();
    return { ok: true, question, buyer: input.buyer, answer: r.value.say, mood: r.value.mood, tell: r.value.tell, pressure, seq: ev.seq, status: statusOf(s, false) };
  } finally {
    await ctx?.flushReceipts().catch(() => undefined);
    await store.unlock(id);
  }
}
