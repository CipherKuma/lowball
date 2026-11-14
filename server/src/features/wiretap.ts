// F4: the private channel, rendered as a multi-speaker scene with ElevenLabs Text-to-Dialogue (eleven_v4)
// with an audio_effects scene so it sounds like a recovered tap, not a studio read.
import type { ChannelMessage } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { sha256Hex } from '../llm/verify.js';
import { utf8 } from '../near/bytes.js';
import { expressive, voiceFor, type CacheLike, type TtsOptions } from '../tts.js';

export const DIALOGUE_URL = 'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_64';
export const DIALOGUE_MODEL = 'eleven_v4';
/** Text-to-Dialogue refuses more than 2,000 characters of text per request. */
export const DIALOGUE_MAX_CHARS = 2000;
/** The recovered-recording scene: narrow, muffled phone band (poor-connection tap) in a small room. Tested intelligible: scribe_v3 transcribes it word for word. */
export const WIRETAP_EFFECTS = { filter_preset_id: 'low_quality_phone', environment_id: 'small_room', send_level: 0.3 } as const;

export interface DialogueInput {
  text: string;
  voice_id: string;
}

/** Narrator intro, then every line of the channel in order, each tagged from its mood. */
export function wiretapInputs(channel: ChannelMessage[], seasonId: number | null, voiceMap?: Record<string, string>): DialogueInput[] {
  const season = seasonId === null ? '' : `, season ${seasonId}`;
  const out: DialogueInput[] = [{ text: `Recording recovered from the warehouse${season}.`, voice_id: voiceFor('narrator', voiceMap) }];
  const ordered = [...channel].sort((a, b) => a.round - b.round);
  for (const m of ordered) out.push({ text: expressive(m.say, m.mood, m.buyer), voice_id: voiceFor(m.buyer, voiceMap) });
  return fitDialogue(out);
}

const total = (xs: DialogueInput[]): number => xs.reduce((n, i) => n + i.text.length, 0);

/** Keeps the whole scene under the 2,000-character cap: every line is shortened to a shared budget at a word boundary (tags stay in front). */
export function fitDialogue(inputs: DialogueInput[], max = DIALOGUE_MAX_CHARS): DialogueInput[] {
  if (total(inputs) <= max) return inputs;
  const per = Math.max(40, Math.floor(max / inputs.length) - 1);
  return inputs.map((i) => {
    if (i.text.length <= per) return i;
    const cut = i.text.slice(0, per);
    const at = cut.lastIndexOf(' ');
    return { ...i, text: `${(at > per / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.-]+$/, '')}...` };
  });
}

export interface WiretapOptions extends Pick<TtsOptions, 'apiKey' | 'fetchFn' | 'cache' | 'reserve' | 'release' | 'voiceMap'> {
  cache?: CacheLike | null;
}

/** Cached per session and per exact script (the Cache API; a miss is one upstream call, counted against the voice cap). */
export async function renderWiretap(sessionId: string, inputs: DialogueInput[], o: WiretapOptions): Promise<Response> {
  const hash = sha256Hex(utf8(JSON.stringify({ inputs, fx: WIRETAP_EFFECTS })));
  const key = new Request(`https://wiretap.lowball.invalid/${sessionId}/${DIALOGUE_MODEL}/${hash}`);
  const hit = await o.cache?.match(key);
  const headers = { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' };
  if (hit) return new Response(hit.body, { status: 200, headers: { ...headers, 'x-wiretap-cache': 'hit' } });
  if (o.reserve && !(await o.reserve())) throw new AppError('TTS_LIMIT');
  const f = o.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await f(DIALOGUE_URL, {
      method: 'POST',
      headers: { 'xi-api-key': o.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ inputs, model_id: DIALOGUE_MODEL, audio_effects: WIRETAP_EFFECTS }),
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
  await o.cache?.put(key, new Response(bytes, { status: 200, headers })).catch(() => undefined);
  return new Response(bytes, { status: 200, headers: { ...headers, 'x-wiretap-cache': 'miss' } });
}
