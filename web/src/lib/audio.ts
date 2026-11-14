import { Howl, Howler } from 'howler';

/**
 * One place for every sound. Music crossfades between beds; voice lines duck the music;
 * nothing plays until the first user gesture (browser autoplay rules).
 */
type Music = 'harbour_loop' | 'harbour_tense';
type Sting = 'confession_sting' | 'victory' | 'defeat';
export type Sfx =
  | 'auction_bell' | 'bond_slash' | 'card_flip' | 'coins_pour' | 'foghorn' | 'folder_open' | 'gavel'
  | 'paper_slide' | 'refusal_thud' | 'ui_hover' | 'ui_tick' | 'wax_seal';

const src = (kind: string, key: string) => [`/audio/${kind}/${key}.ogg`, `/audio/${kind}/${key}.mp3`];

const MUSIC_VOL = 0.42;
const DUCK_VOL = 0.16;

class AudioDirector {
  private music = new Map<Music, Howl>();
  private beds = new Map<string, Howl>();
  private sfxCache = new Map<string, Howl>();
  private current: Music | null = null;
  private voice: Howl | null = null;
  private queue: Array<() => Howl> = [];
  unlocked = false;
  muted = false;

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const m of ['harbour_loop', 'harbour_tense'] as Music[]) {
      this.music.set(m, new Howl({ src: src('music', m), loop: true, volume: 0, html5: false }));
    }
    const rain = new Howl({ src: src('sfx', 'rain_loop'), loop: true, volume: 0.18 });
    const lamp = new Howl({ src: src('sfx', 'lamp_buzz_loop'), loop: true, volume: 0.05 });
    this.beds.set('rain', rain);
    this.beds.set('lamp', lamp);
    rain.play();
    lamp.play();
  }

  setMuted(m: boolean) {
    this.muted = m;
    Howler.mute(m);
  }

  playMusic(next: Music, fadeMs = 1600) {
    if (!this.unlocked || this.current === next) return;
    const prev = this.current ? this.music.get(this.current) : undefined;
    const h = this.music.get(next);
    if (!h) return;
    if (!h.playing()) h.play();
    h.fade(h.volume(), this.voice ? DUCK_VOL : MUSIC_VOL, fadeMs);
    if (prev) prev.fade(prev.volume(), 0, fadeMs);
    this.current = next;
  }

  stopMusic(fadeMs = 1200) {
    const h = this.current ? this.music.get(this.current) : undefined;
    if (h) h.fade(h.volume(), 0, fadeMs);
    this.current = null;
  }

  sting(key: Sting, volume = 0.7) {
    if (!this.unlocked) return;
    new Howl({ src: src('music', key), volume }).play();
  }

  sfx(key: Sfx, volume = 0.6) {
    if (!this.unlocked) return;
    let h = this.sfxCache.get(key);
    if (!h) {
      h = new Howl({ src: src('sfx', key), volume });
      this.sfxCache.set(key, h);
    }
    h.volume(volume);
    h.play();
  }

  private duck(on: boolean) {
    const h = this.current ? this.music.get(this.current) : undefined;
    if (h) h.fade(h.volume(), on ? DUCK_VOL : MUSIC_VOL, 300);
  }

  private next() {
    const make = this.queue.shift();
    if (!make) {
      this.voice = null;
      this.duck(false);
      return;
    }
    const h = make();
    this.voice = h;
    this.duck(true);
    const done = () => this.next();
    h.once('end', done);
    h.once('loaderror', done);
    h.once('playerror', done);
    h.play();
  }

  /** Queue a pre-voiced line (file key from audio/lines.md). */
  say(key: string) {
    if (!this.unlocked) return;
    this.queue.push(() => new Howl({ src: src('vo', key), volume: 1 }));
    if (!this.voice) this.next();
  }

  /** Queue a runtime TTS line from the server (mp3 URL). */
  sayUrl(url: string) {
    if (!this.unlocked) return;
    this.queue.push(() => new Howl({ src: [url], format: ['mp3'], volume: 1, html5: true }));
    if (!this.voice) this.next();
  }

  clearVoices() {
    this.queue = [];
    this.voice?.stop();
    this.voice = null;
    this.duck(false);
  }
}

export const audio = new AudioDirector();
