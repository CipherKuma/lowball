// Which events GET /api/tts can voice, and in whose voice.
import type { GameEvent } from '../../../shared/api.js';
import type { Speaker } from '../tts.js';

export interface Spoken {
  speaker: Speaker;
  text: string;
  mood?: string;
}

export function speakable(ev: GameEvent | null): Spoken | null {
  if (!ev) return null;
  switch (ev.type) {
    case 'line':
      return { speaker: ev.buyer, text: ev.text, mood: ev.mood };
    case 'interrogation':
      return { speaker: ev.buyer, text: ev.answer, mood: ev.mood };
    case 'recap':
      return { speaker: 'narrator', text: ev.text };
    default:
      return null;
  }
}
