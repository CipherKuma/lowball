import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useRecorder } from '../../lib/useRecorder';

const MAX_MS = 20_000;
const MIN_MS = 1200;
const RING = 2 * Math.PI * 62;

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `0:${String(s).padStart(2, '0')}`;
}

/**
 * The desk-side ask panel: one brass record button (tap to start, tap to finish; hold-and-release also
 * works) and the typed question underneath, always visible. Too-short takes never spend the day.
 */
export function MicDesk({
  name,
  error,
  text,
  setText,
  onAsk,
}: {
  name: string;
  error: string | null;
  text: string;
  setText: (t: string) => void;
  onAsk: (input: { audio?: Blob; text?: string }) => void;
}) {
  const rec = useRecorder(MAX_MS);
  const [hint, setHint] = useState<string | null>(null);
  const pressAt = useRef(0);
  const finishing = useRef(false);
  const canMic = rec.state !== 'unsupported' && rec.state !== 'denied';
  const listening = rec.state === 'recording';
  const live = listening || rec.state === 'starting';
  const leftS = Math.max(0, Math.ceil((rec.maxMs - rec.elapsed) / 1000));

  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    const { blob, ms } = await rec.stop();
    finishing.current = false;
    if (!blob || ms < MIN_MS || blob.size < 4000) {
      setHint('That was too short to hear. Tap the button, say your piece, then tap it again. Your question for today is not spent.');
      return;
    }
    setHint(null);
    onAsk({ audio: blob });
  };

  // The recorder stops itself at the cap; send what was said instead of dropping it.
  useEffect(() => {
    if (listening && rec.elapsed >= rec.maxMs - 300) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, rec.elapsed, rec.maxMs]);

  const begin = () => {
    setHint(null);
    void rec.start();
  };
  const press = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (rec.state === 'starting') return;
    if (listening) {
      void finish();
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pressAt.current = performance.now();
    begin();
  };
  const lift = () => {
    const held = pressAt.current ? performance.now() - pressAt.current : 0;
    pressAt.current = 0;
    if (held > 700 && rec.state === 'recording') void finish();
  };

  const submitText = () => {
    const t = text.trim();
    if (t.split(/\s+/).filter(Boolean).length < 3) {
      setHint('Give them a full question, at least three words.');
      return;
    }
    setHint(null);
    onAsk({ text: t.slice(0, 240) });
  };

  const head = rec.state === 'starting' ? 'Allow the microphone…' : listening ? 'Listening' : 'Tap to speak';
  const sub =
    rec.state === 'starting'
      ? 'Your browser is asking. Nothing is recorded until you allow it.'
      : listening
        ? 'Tap again to stop and send.'
        : 'Or hold it down and let go when you are done. Twenty seconds at most.';

  return (
    <div className="ask">
      {canMic && (
        <div className="ask-mic" data-state={rec.state}>
          <button
            type="button"
            className="recbtn"
            data-tour="mic"
            data-autofocus
            onPointerDown={press}
            onPointerUp={lift}
            onPointerCancel={lift}
            // Screen readers and switch access activate with a bare click (detail 0) and no pointer events.
            onClick={(e) => {
              if (e.detail !== 0) return;
              if (listening) void finish();
              else if (rec.state !== 'starting') begin();
            }}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                if (listening) void finish();
                else if (rec.state !== 'starting') begin();
              }
            }}
            aria-pressed={live}
            aria-label={live ? 'Stop and send' : 'Start speaking'}
          >
            <svg className="recbtn-ring" viewBox="0 0 140 140" aria-hidden>
              <circle cx="70" cy="70" r="62" className="recbtn-track" />
              <circle
                cx="70"
                cy="70"
                r="62"
                className="recbtn-fill"
                style={{ strokeDasharray: RING, strokeDashoffset: listening ? RING * (1 - Math.min(1, rec.elapsed / rec.maxMs)) : RING }}
              />
            </svg>
            <span className="recbtn-bezel" aria-hidden>
              <span className="recbtn-cap">
                {listening ? (
                  <span className="recbtn-stop" />
                ) : (
                  <svg width="34" height="46" viewBox="0 0 34 46" className="recbtn-mic">
                    <rect x="7" y="2" width="20" height="30" rx="10" />
                    <path d="M7 12h20M7 17h20M7 22h20" />
                    <path d="M2 22a15 15 0 0030 0M17 37v7M10 44h14" fill="none" />
                  </svg>
                )}
              </span>
            </span>
            {listening && <span className="recbtn-pulse" aria-hidden />}
          </button>
          <div className="ask-state" aria-live="polite">
            <p className="ask-head sign">
              {head}
              {listening && <span className="ask-clock data"> {clock(rec.elapsed)}</span>}
            </p>
            <p className="ask-sub typed">{sub}</p>
            {listening && (
              <p className="ask-left data" data-low={leftS <= 5 || undefined}>
                {leftS} s left
              </p>
            )}
          </div>
        </div>
      )}

      {(hint || (error && !live)) && (
        <p className="ask-note typed" role={hint ? 'status' : 'alert'}>
          {hint ?? error}
        </p>
      )}

      <form
        className="ask-type"
        onSubmit={(e) => {
          e.preventDefault();
          submitText();
        }}
      >
        <label className="label" htmlFor="ask-text">
          {canMic ? 'Or type it' : 'Type your question'}
        </label>
        <div className="ask-row">
          <input
            id="ask-text"
            className="ask-input typed"
            data-tour="ask-text"
            data-autofocus={!canMic || undefined}
            value={text}
            maxLength={240}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Who set the number, ${name}?`}
            aria-label="What you say"
            autoComplete="off"
          />
          <button className="ticket" disabled={!text.trim() || live}>
            Say it
          </button>
        </div>
        <p className="ask-count data" aria-hidden>
          {text.length}/240
        </p>
        {live && <p className="plaque-note">Finish speaking first, or type once the mic is off.</p>}
        {rec.state === 'denied' && <p className="plaque-note">Microphone blocked, so type your question instead.</p>}
        {rec.state === 'unsupported' && <p className="plaque-note">This browser cannot record, so type your question instead.</p>}
      </form>
    </div>
  );
}
