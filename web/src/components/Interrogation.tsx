import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { BuyerId } from '../../../shared/api';
import type { Interrogation as Exchange } from '../lib/extra';
import { useRecorder } from '../lib/useRecorder';

const ease = [0.23, 1, 0.32, 1] as const;
const MAX_PRESSURE = 6;

interface Props {
  buyer: { id: BuyerId; name: string };
  exchange: Exchange | null;
  pending: boolean;
  error: string | null;
  onAsk: (input: { audio?: Blob; text?: string }) => void;
  onClose: () => void;
}

/** The back room: corner one buyer, speak (or type), and hear them answer in their own voice. */
export function InterrogationRoom({ buyer, exchange, pending, error, onAsk, onClose }: Props) {
  const rec = useRecorder(20_000);
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const pressAt = useRef(0);
  const canMic = rec.state !== 'unsupported' && rec.state !== 'denied';
  const left = Math.max(0, Math.ceil((rec.maxMs - rec.elapsed) / 1000));
  const live = rec.state === 'recording' || rec.state === 'starting';

  // Tap once to start and again to finish, or hold and let go. Leaving the button never cuts you off.
  const finish = async () => {
    const { blob, ms } = await rec.stop();
    if (!blob || ms < 1200 || blob.size < 4000) {
      setHint("That was too short to hear. Tap the mic, say your piece, then tap again.");
      return;
    }
    setHint(null);
    onAsk({ audio: blob });
  };
  const press = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (live) {
      void finish();
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pressAt.current = performance.now();
    setHint(null);
    void rec.start();
  };
  const lift = () => {
    const held = pressAt.current ? performance.now() - pressAt.current : 0;
    pressAt.current = 0;
    if (held > 700 && rec.state === 'recording') void finish();
  };

  return (
    <motion.div className="interro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <motion.section
        className="interro-card"
        role="dialog"
        aria-label={`Interrogating ${buyer.name}`}
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease }}
      >
        <button className="interro-x" onClick={onClose} aria-label="Leave the back room">×</button>
        <div className="interro-portrait">
          <img src={`/art/${buyer.id}_${exchange && exchange.pressure >= 4 ? 'cracked' : 'calm'}.webp`} alt="" />
          <div className="interro-lamp" aria-hidden />
        </div>
        <div className="interro-body">
          <p className="slab-kicker">The back room · one question a day</p>
          <h2 className="display">{buyer.name}</h2>

          <AnimatePresence mode="wait">
            {!exchange && !pending && (
              <motion.div key="ask" className="interro-ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="interro-hint">
                  Lean on them. Say what you know, what you'll do, what they stand to lose. They answer in their own voice, and
                  what you say stays with them when you offer leniency.
                </p>
                {canMic && (
                  <>
                    <button
                      type="button"
                      className="mic"
                      data-rec={rec.state === 'recording' || undefined}
                      onPointerDown={press}
                      onPointerUp={lift}
                      onKeyDown={(e) => {
                        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                          e.preventDefault();
                          if (live) void finish();
                          else void rec.start();
                        }
                      }}
                      aria-pressed={live}
                      aria-label={live ? 'Stop and send' : 'Start speaking'}
                    >
                      <span className="mic-ring" style={{ ['--p' as string]: `${(rec.elapsed / rec.maxMs) * 100}%` }} />
                      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
                        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                        <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                      </svg>
                    </button>
                    <p className="mic-label" aria-live="polite">
                      {rec.state === 'starting'
                        ? 'Allow the microphone…'
                        : rec.state === 'recording'
                          ? `Listening · tap again when you're done · ${left}s`
                          : 'Tap to speak'}
                    </p>
                    {hint && <p className="interro-note" role="status">{hint}</p>}
                  </>
                )}
                <form
                  className="interro-type"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = text.trim();
                    if (t.split(/\s+/).length < 3) {
                      setHint('Give them a full question, at least a few words.');
                      return;
                    }
                    onAsk({ text: t.slice(0, 240) });
                  }}
                >
                  <input
                    value={text}
                    maxLength={240}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={canMic ? '…or type it: four envelopes said the same number. Who wrote it?' : 'Four envelopes said the same number. Who wrote it?'}
                    aria-label="What you say"
                    autoFocus={!canMic}
                  />
                  <button className="btn btn-amber" disabled={!text.trim() || live}>Say it</button>
                  {rec.state === 'denied' && <p className="interro-note">Microphone blocked, so type your question instead.</p>}
                  {rec.state === 'unsupported' && <p className="interro-note">This browser can't record, so type your question instead.</p>}
                </form>
              </motion.div>
            )}
            {pending && !exchange && (
              <motion.p key="wait" className="interro-wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {buyer.name.split(' ')[0]} takes a long breath…
              </motion.p>
            )}
            {exchange && (
              <motion.div key="answer" className="interro-answer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
                <p className="q">
                  <span>You</span>“{exchange.question}”
                </p>
                <p className="a display">“{exchange.answer}”</p>
                {exchange.tell && <p className="tell">{exchange.tell.charAt(0).toUpperCase() + exchange.tell.slice(1)}</p>}
                <div className="pressure" aria-label={`Pressure ${exchange.pressure} of ${MAX_PRESSURE}`}>
                  <span>Pressure</span>
                  <div>
                    {Array.from({ length: MAX_PRESSURE }, (_, i) => (
                      <i key={i} data-on={i < exchange.pressure || undefined} />
                    ))}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={onClose}>Back to the table</button>
              </motion.div>
            )}
          </AnimatePresence>
          {error && <p className="setup-error" role="alert">{error}</p>}
        </div>
      </motion.section>
    </motion.div>
  );
}
