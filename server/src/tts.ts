import { AppError } from './errors.js';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { sha256Hex } from './llm/verify.js';
import { utf8 } from './near/bytes.js';
import voices from './generated/voices.json';

/** Expressive model: it reads audio tags such as [tense] and [pause] aloud as delivery, not as words. */
export const TTS_MODEL = 'eleven_v3';

export type Speaker = BuyerId | 'narrator';

/** Mood -> v3 audio tag. calm is untagged; cracking alternates [nervous] / [shaky] by text so a buyer is not monotone. */
export function moodTag(mood: string | undefined, text = ''): string {
  switch (mood) {
    case 'tense':
      return '[tense]';
    case 'cracking':
      return text.length % 2 === 0 ? '[nervous]' : '[shaky]';
    case 'cold':
      return '[cold]';
    default:
      return '';
  }
}

/** Mood tag in front, plus one light [pause] at the first natural break when the line is long enough to have one. */
export function expressive(text: string, mood?: string): string {
  const clean = text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').length;
  let body = clean;
  if (words >= 8) {
    const m = /^(.{12,}?[,;:.!?]|.{12,}?\s[-\u2014]{1,2})\s+(?=\S+\s+\S+\s+\S+)/.exec(clean);
    if (m) body = `${m[1]} [pause] ${clean.slice(m[0].length)}`;
  }
  const tag = moodTag(mood, clean);
  return tag ? `${tag} ${body}` : body;
}

export function voiceFor(buyer: Speaker, map: Record<string, string> = voices as Record<string, string>): string {
  const v = map[buyer];
  if (!v) throw new AppError('TTS_UNAVAILABLE', `no voice configured for ${buyer}`);
  return v;
}

export interface CacheLike {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

export interface TtsOptions {
  apiKey: string;
  cache?: CacheLike | null;
  fetchFn?: typeof fetch;
  voiceMap?: Record<string, string>;
  /** the line's mood: becomes a v3 audio tag */
  mood?: string;
  /** claim one upstream call (false: the session's cap is spent); cache hits never call it */
  reserve?: () => Promise<boolean>;
  /** hand a claimed call back when the upstream call failed */
  release?: () => Promise<void>;
}

/** ElevenLabs v3 TTS with a Cache API layer keyed by voice + model + the exact tagged text. */
export async function synthesize(buyer: Speaker, text: string, o: TtsOptions): Promise<Response> {
  if (buyer !== 'narrator' && !BUYER_IDS.includes(buyer)) throw new AppError('BAD_REQUEST');
  const voice = voiceFor(buyer, o.voiceMap);
  // the narrator reads plain copy; buyers get mood tags
  const spoken = buyer === 'narrator' ? text : expressive(text, o.mood);
  const keyUrl = `https://tts.lowball.invalid/${voice}/${TTS_MODEL}/${sha256Hex(utf8(spoken))}`;
  const cacheKey = new Request(keyUrl);
  const hit = await o.cache?.match(cacheKey);
  if (hit) return new Response(hit.body, { status: 200, headers: { 'content-type': 'audio/mpeg', 'x-tts-cache': 'hit', 'cache-control': 'public, max-age=86400' } });
  if (o.reserve && !(await o.reserve())) throw new AppError('TTS_LIMIT');
  const f = o.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': o.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      // v3 accepts stability 0.0 (creative), 0.5 (natural) or 1.0 (robust)
      body: JSON.stringify({ text: spoken, model_id: TTS_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
    });
  } catch {
    await o.release?.();
    throw new AppError('TTS_UNAVAILABLE');
  }
  if (!res.ok) {
    await o.release?.();
    throw new AppError('TTS_UNAVAILABLE');
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const headers = { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' };
  await o.cache?.put(cacheKey, new Response(bytes, { status: 200, headers })).catch(() => undefined);
  return new Response(bytes, { status: 200, headers: { ...headers, 'x-tts-cache': 'miss' } });
}
