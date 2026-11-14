import { AppError } from './errors.js';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { sha256Hex } from './llm/verify.js';
import { utf8 } from './near/bytes.js';
import voices from './generated/voices.json';

export const TTS_MODEL = 'eleven_flash_v2_5';

export function voiceFor(buyer: BuyerId, map: Record<string, string> = voices as Record<string, string>): string {
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
  /** claim one upstream call (false: the session's cap is spent); cache hits never call it */
  reserve?: () => Promise<boolean>;
  /** hand a claimed call back when the upstream call failed */
  release?: () => Promise<void>;
}

/** ElevenLabs flash TTS with a Cache API layer keyed by voice + text hash. */
export async function synthesize(buyer: BuyerId, text: string, o: TtsOptions): Promise<Response> {
  if (!BUYER_IDS.includes(buyer)) throw new AppError('BAD_REQUEST');
  const voice = voiceFor(buyer, o.voiceMap);
  const keyUrl = `https://tts.lowball.invalid/${voice}/${TTS_MODEL}/${sha256Hex(utf8(text))}`;
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
      body: JSON.stringify({ text, model_id: TTS_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8 } }),
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
