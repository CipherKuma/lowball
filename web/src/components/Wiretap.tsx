import { useEffect, useRef, useState } from 'react';
import { audio as director } from '../lib/audio';

/** The cartel's private channel, performed as a recovered wiretap (ElevenLabs Text-to-Dialogue). */
export function Wiretap({ url }: { url: string | null }) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(() => () => el.current?.pause(), []);
  if (!url) return null;

  const toggle = () => {
    if (!el.current) {
      const a = new Audio(url);
      el.current = a;
      a.addEventListener('timeupdate', () => setProgress(a.duration ? a.currentTime / a.duration : 0));
      a.addEventListener('playing', () => setState('playing'));
      a.addEventListener('pause', () => setState((s) => (s === 'loading' ? s : 'paused')));
      a.addEventListener('ended', () => {
        setState('paused');
        setProgress(1);
        director.playMusic('harbour_loop', 1200);
      });
      a.addEventListener('error', () => setState('error'));
      setState('loading');
      director.stopMusic(600);
      void a.play().catch(() => setState('error'));
      return;
    }
    if (el.current.paused) {
      director.stopMusic(600);
      void el.current.play();
    } else el.current.pause();
  };

  return (
    <div className="wiretap" data-state={state}>
      <button className="wiretap-btn" onClick={toggle} aria-label={state === 'playing' ? 'Pause the wiretap' : 'Play the wiretap'}>
        {state === 'playing' ? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><rect x="3" y="2" width="3.5" height="12" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>
        )}
      </button>
      <div className="wiretap-copy">
        <strong>Play the wiretap</strong>
        <span>
          {state === 'loading'
            ? 'Pulling the reel from the warehouse…'
            : state === 'error'
              ? 'The reel is damaged. Try again in a moment.'
              : 'Their private talk before the season, in their own voices'}
        </span>
        <div className="wiretap-bar" aria-hidden>
          <i style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>
    </div>
  );
}
