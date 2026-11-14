// BRIEF-3 routes, mounted by app.ts with one call.
import type { Context, Hono } from 'hono';
import { AppError } from '../errors.js';
import type { GameDeps } from '../game/ctx.js';
import { SessionIdSchema } from '../schemas.js';
import type { CacheLike } from '../tts.js';
import { interrogate } from './interrogate.js';
import { InterrogateFormSchema } from './schemas.js';
import { AUDIO_TYPES, baseType, MAX_AUDIO_BYTES } from './stt.js';
import { renderWiretap, wiretapInputs } from './wiretap.js';

export interface FeatureRouteOptions {
  deps: (c: Context) => GameDeps;
  elevenLabsKey: (c: Context) => string;
  ttsMaxPerSession: (c: Context) => number;
  cache?: () => CacheLike | null;
  /** one injectable fetch for every ElevenLabs call (tests) */
  fetchFn?: typeof fetch;
}

function sid(c: Context): string {
  const r = SessionIdSchema.safeParse(c.req.param('id'));
  if (!r.success) throw new AppError('BAD_REQUEST', 'Invalid session id.');
  return r.data;
}

async function readForm(c: Context): Promise<FormData> {
  const len = Number(c.req.header('content-length') ?? 0);
  // a little over the audio cap for the multipart envelope; anything bigger is refused before it is read
  if (len > MAX_AUDIO_BYTES + 65_536) throw new AppError('BAD_REQUEST', 'That recording is too large.');
  try {
    return await c.req.formData();
  } catch {
    throw new AppError('BAD_REQUEST', 'Body must be multipart/form-data.');
  }
}

export function registerFeatureRoutes(app: Hono, o: FeatureRouteOptions): void {
  app.post('/api/session/:id/interrogate', async (c) => {
    const id = sid(c);
    const form = await readForm(c);
    const fields = InterrogateFormSchema.safeParse({ buyer: form.get('buyer') ?? undefined, text: typeof form.get('text') === 'string' ? form.get('text') : undefined });
    if (!fields.success) throw new AppError('BAD_REQUEST', fields.error.issues[0]?.message ?? 'Invalid request.');
    const audio = form.get('audio');
    const hasAudio = audio !== null && typeof audio !== 'string';
    if (hasAudio === (fields.data.text !== undefined)) throw new AppError('BAD_REQUEST', 'Send either audio or text.');
    let blob: Blob | undefined;
    if (hasAudio) {
      const f = audio as Blob;
      if (f.size === 0) throw new AppError('BAD_REQUEST', 'The recording is empty.');
      if (f.size > MAX_AUDIO_BYTES) throw new AppError('BAD_REQUEST', 'That recording is too large (1.5 MB at most).');
      if (!AUDIO_TYPES.includes(baseType(f.type))) throw new AppError('BAD_REQUEST', 'Audio must be webm, ogg or mp4.');
      blob = f;
    }
    const deps = o.deps(c);
    const max = o.ttsMaxPerSession(c);
    const out = await interrogate(
      deps,
      id,
      { buyer: fields.data.buyer, text: fields.data.text, audio: blob },
      { apiKey: o.elevenLabsKey(c), fetchFn: o.fetchFn, reserve: () => deps.store.reserveTts(id, max), release: () => deps.store.releaseTts(id) },
    );
    return c.json(out);
  });

  app.get('/api/session/:id/wiretap', async (c) => {
    const id = sid(c);
    const deps = o.deps(c);
    const s = await deps.store.loadState(id);
    if (!s) throw new AppError('NOT_FOUND', 'No such session.');
    if (s.phase !== 'closed') throw new AppError('BAD_PHASE', 'The recording is sealed until the season closes.');
    if (s.channel.length === 0) throw new AppError('NOT_FOUND', 'There is no recording for this season.');
    const max = o.ttsMaxPerSession(c);
    return renderWiretap(id, wiretapInputs(s.channel, s.seasonId), {
      apiKey: o.elevenLabsKey(c),
      fetchFn: o.fetchFn,
      cache: o.cache?.() ?? null,
      reserve: () => deps.store.reserveTts(id, max),
      release: () => deps.store.releaseTts(id),
    });
  });
}
