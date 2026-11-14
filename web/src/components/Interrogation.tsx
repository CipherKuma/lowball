import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
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
  const rec = useRecorder(12_000);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const canMic = rec.state !== 'unsupported' && rec.state !== 'denied';
  const left = Math.max(0, Math.ceil((rec.maxMs - rec.elapsed) / 1000));

  const release = async () => {
    const blob = await rec.stop();
    if (blob && blob.size > 2000) onAsk({ audio: blob });
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
                {canMic && !typing ? (
                  <>
                    <button
                      className="mic"
                      data-rec={rec.state === 'recording' || undefined}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        void rec.start();
                      }}
                      onPointerUp={() => void release()}
                      onPointerLeave={() => rec.state === 'recording' && void release()}
                      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && void rec.start()}
                      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && void release()}
                      aria-label="Hold to speak"
                    >
                      <span className="mic-ring" style={{ ['--p' as string]: `${(rec.elapsed / rec.maxMs) * 100}%` }} />
                      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
                        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                        <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                      </svg>
                    </button>
                    <p className="mic-label">{rec.state === 'recording' ? `Speaking… ${left}s` : 'Hold to speak'}</p>
                    <button className="link-btn" onClick={() => setTyping(true)}>Type instead</button>
                  </>
                ) : (
                  <form
                    className="interro-type"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (text.trim()) onAsk({ text: text.trim().slice(0, 240) });
                    }}
                  >
                    <input
                      value={text}
                      maxLength={240}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="I've got four envelopes with the same number on them…"
                      aria-label="What you say"
                      autoFocus
                    />
                    <button className="btn btn-amber" disabled={!text.trim()}>Say it</button>
                    {rec.state === 'denied' && <p className="interro-note">Microphone blocked, so you'll have to type it.</p>}
                  </form>
                )}
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
