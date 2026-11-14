import { AppError } from './errors.js';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { sha256Hex } from './llm/verify.js';
import { utf8 } from './near/bytes.js';
import voices from './generated/voices.json';

/** Eleven v4: best quality, used for the narrator (recaps, wiretap scene). Reads [bracketed] audio tags as delivery, not words. */
export const TTS_MODEL = 'eleven_v4';
/** Eleven v4 Turbo (~0.75 s): the live buyer lines and interrogation answers, where latency matters. */
export const TTS_MODEL_LIVE = 'eleven_v4_turbo';

export type Speaker = BuyerId | 'narrator';

export function modelFor(speaker: Speaker): string {
  return speaker === 'narrator' ? TTS_MODEL : TTS_MODEL_LIVE;
}

/** Voice-quality descriptors per buyer, matching the pre-rendered VO (audio/PROMPTS.md). v4 reads descriptive tags, not bare emotions. */
const PERSONA: Record<BuyerId, string> = {
  marlow: 'gravelly',
  odile: 'precise',
  sully: 'nervous',
  ines: 'warm',
  deacon: 'low voice',
};

/** Per-voice stability (v4 takes a continuous 0..1): steady voices high, jittery ones low. Same values as the pre-rendered VO. */
const STABILITY: Record<BuyerId | 'narrator', number> = { narrator: 0.5, marlow: 0.4, odile: 0.7, sully: 0.3, ines: 0.45, deacon: 0.7 };

/** Mood -> v4 descriptors. calm adds none; cracking alternates by text so a buyer is not monotone. */
function moodWords(mood: string | undefined, text: string): string[] {
  switch (mood) {
    case 'tense':
      return ['tense', 'low voice'];
    case 'cracking':
      return text.length % 2 === 0 ? ['nervous', 'breathless'] : ['shaky', 'panicked'];
    case 'cold':
      return ['cold', 'precise'];
    default:
      return [];
  }
}

/** One bracketed tag from the mood (and, when the buyer is known, their voice quality). calm without a buyer is untagged. */
export function moodTag(mood: string | undefined, text = '', buyer?: BuyerId): string {
  const mw = moodWords(mood, text);
  const words = [...(buyer ? [PERSONA[buyer]] : []), ...mw].filter((w, i, all) => all.indexOf(w) === i);
  return words.length ? `[${words.join(', ')}]` : '';
}

/** Tag in front; v4 has no SSML breaks, so a longer line gets one ellipsis at its first natural break instead of a [pause] tag. */
export function expressive(text: string, mood?: string, buyer?: BuyerId): string {
  const clean = text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').length;
  let body = clean;
  if (words >= 8) {
    const m = /^(.{12,}?)[,;:]\s+(?=\S+\s+\S+\s+\S+)/.exec(clean);
    if (m) body = `${m[1]}... ${clean.slice(m[0].length)}`;
  }
  const tag = moodTag(mood, clean, buyer);
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
  /** the line's mood: becomes a v4 audio tag */
  mood?: string;
  /** claim one upstream call (false: the session's cap is spent); cache hits never call it */
  reserve?: () => Promise<boolean>;
  /** hand a claimed call back when the upstream call failed */
  release?: () => Promise<void>;
}

/** ElevenLabs v4 TTS (v4 Turbo for buyers, v4 for the narrator) with a Cache API layer keyed by voice + model + the exact tagged text. */
export async function synthesize(buyer: Speaker, text: string, o: TtsOptions): Promise<Response> {
  if (buyer !== 'narrator' && !BUYER_IDS.includes(buyer)) throw new AppError('BAD_REQUEST');
  const voice = voiceFor(buyer, o.voiceMap);
  // the narrator reads plain copy; buyers get mood tags
  const spoken = buyer === 'narrator' ? text : expressive(text, o.mood, buyer);
  const model = modelFor(buyer);
  const keyUrl = `https://tts.lowball.invalid/${voice}/${model}/${sha256Hex(utf8(spoken))}`;
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
      body: JSON.stringify({ text: spoken, model_id: model, voice_settings: { stability: STABILITY[buyer], similarity_boost: 0.8 } }),
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
