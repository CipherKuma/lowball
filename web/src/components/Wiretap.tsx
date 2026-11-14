import { useEffect, useRef, useState } from 'react';
import { audio as director } from '../lib/audio';
import '../styles/backroom-wiretap.css';

type State = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

function clock(s: number) {
  if (!Number.isFinite(s) || s < 0) return '--:--';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** One tape reel: a metal flange with six windows, and a wound pack of tape whose radius follows the progress. */
function Reel({ pack }: { pack: number }) {
  return (
    <svg className="reel" viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r={18 + 28 * pack} className="reel-tape" />
      <g className="reel-spin">
        <circle cx="50" cy="50" r="47" className="reel-flange" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <circle key={a} cx="50" cy="19" r="8.5" transform={`rotate(${a} 50 50)`} className="reel-cut" />
        ))}
        <circle cx="50" cy="50" r="40" className="reel-rim" />
        <circle cx="50" cy="50" r="9" className="reel-hub" />
        <circle cx="50" cy="50" r="3" className="reel-pin" />
      </g>
    </svg>
  );
}

/** The cartel's private channel, recovered as a reel-to-reel wiretap (ElevenLabs Text-to-Dialogue). */
export function Wiretap({ url }: { url: string | null }) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<State>('idle');
  const [at, setAt] = useState(0);
  const [dur, setDur] = useState(NaN);

  useEffect(() => () => el.current?.pause(), []);

  const toggle = () => {
    if (!url) return;
    if (!el.current || state === 'error') {
      const a = new Audio(url);
      el.current = a;
      a.addEventListener('timeupdate', () => setAt(a.currentTime));
      a.addEventListener('loadedmetadata', () => setDur(a.duration));
      a.addEventListener('playing', () => setState('playing'));
      a.addEventListener('pause', () => setState((s) => (s === 'loading' || s === 'ended' ? s : 'paused')));
      a.addEventListener('ended', () => {
        setState('ended');
        director.playMusic('harbour_loop', 1200);
      });
      a.addEventListener('error', () => setState('error'));
      setState('loading');
      director.stopMusic(600);
      void a.play().catch(() => setState('error'));
      return;
    }
    if (el.current.paused) {
      if (state === 'ended') el.current.currentTime = 0;
      director.stopMusic(600);
      void el.current.play();
    } else el.current.pause();
  };

  const progress = Number.isFinite(dur) && dur > 0 ? Math.min(1, at / dur) : 0;
  const playing = state === 'playing';
  const osd = !url
    ? ['NO REEL', '--:--']
    : state === 'loading'
      ? ['LOADING', clock(at)]
      : state === 'error'
        ? ['TAPE DAMAGED', '--:--']
        : playing
          ? ['PLAY', clock(at)]
          : state === 'paused'
            ? ['PAUSE', clock(at)]
            : state === 'ended'
              ? ['END', clock(dur)]
              : ['STOP', '00:00'];

  return (
    <section className="tape" data-state={url ? state : 'empty'} aria-label="The wiretap">
      <div className="tape-deck">
        <div className="tape-reels">
          <Reel pack={1 - progress} />
          <span className="tape-path" aria-hidden />
          <Reel pack={progress} />
        </div>
        <div className="tape-panel">
          <div className="tape-osd data" aria-live="polite">
            <span className="tape-mode">
              {playing && <span className="rec-dot" aria-hidden />} {osd[0]}
            </span>
            <span className="tape-time">
              {osd[1]}
              <small> / {clock(dur)}</small>
            </span>
          </div>
          <button
            className="tape-key"
            onClick={toggle}
            disabled={!url || state === 'loading'}
            aria-label={playing ? 'Pause the wiretap' : 'Play the wiretap'}
          >
            {playing ? (
              <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden><rect x="3" y="2" width="3.5" height="12" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>
            )}
            <span>{playing ? 'Pause' : state === 'error' ? 'Retry' : state === 'ended' ? 'Again' : 'Play'}</span>
          </button>
        </div>
      </div>
      <div className="tape-label">
        <p className="sign">The wiretap</p>
        <p className="typed">Their private talk before the season, in their own voices.</p>
        <p className="plaque-note">
          {!url
            ? 'No reel was recorded for this season.'
            : state === 'loading'
              ? 'Pulling the reel from the warehouse…'
              : state === 'error'
                ? 'The reel is damaged. Try again in a moment.'
                : 'Recovered from the buyers’ channel. Voices by ElevenLabs.'}
        </p>
      </div>
    </section>
  );
}
