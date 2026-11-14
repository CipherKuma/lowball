// F3: ElevenLabs Speech-to-Text (scribe_v3 with keyterm prompting, language auto-detected).
import { AppError } from '../errors.js';

export const STT_MODEL = 'scribe_v3';
/** Names and game words the transcriber is primed to hear correctly (keyterm prompting, up to 1,000 allowed). */
export const STT_KEYTERMS = ['Marlow', 'Odile', 'Sully', 'Ines', 'Deacon', 'Marguerite', 'Pier Nine', 'leniency', 'cartel', 'pact', 'bond', 'envelope', 'immunity'] as const;
export const STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
export const MAX_AUDIO_BYTES = 1_572_864; // 1.5 MiB
export const MAX_AUDIO_SECONDS = 15;
export const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/x-m4a', 'audio/aac', 'video/webm', 'video/mp4'];

export interface Transcript {
  text: string;
  languageCode: string | null;
  /** end of the last spoken word, seconds (null when the response had no word times) */
  seconds: number | null;
}

/** Strips parameters ("audio/webm;codecs=opus" -> "audio/webm"). */
export function baseType(t: string): string {
  return t.split(';')[0]!.trim().toLowerCase();
}

export async function transcribe(audio: Blob, apiKey: string, fetchFn: typeof fetch = fetch): Promise<Transcript> {
  const form = new FormData();
  form.append('model_id', STT_MODEL);
  form.append('tag_audio_events', 'false');
  for (const k of STT_KEYTERMS) form.append('keyterms', k);
  form.append('file', audio, 'question.webm');
  let res: Response;
  try {
    res = await fetchFn(STT_URL, { method: 'POST', headers: { 'xi-api-key': apiKey }, body: form });
  } catch {
    throw new AppError('STT_UNAVAILABLE');
  }
  if (!res.ok) throw new AppError('STT_UNAVAILABLE');
  let j: { text?: unknown; language_code?: unknown; words?: { end?: unknown }[] };
  try {
    j = (await res.json()) as typeof j;
  } catch {
    throw new AppError('STT_UNAVAILABLE');
  }
  const text = typeof j.text === 'string' ? j.text.replace(/\s+/g, ' ').trim() : '';
  const ends = (j.words ?? []).map((w) => (typeof w.end === 'number' ? w.end : 0));
  return {
    text,
    languageCode: typeof j.language_code === 'string' ? j.language_code : null,
    seconds: ends.length ? Math.max(...ends) : null,
  };
}
