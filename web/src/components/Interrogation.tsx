import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import type { BuyerId } from '../../../shared/api';
import type { Interrogation as Exchange } from '../lib/extra';
import { Answer } from './backroom/Answer';
import { Feed } from './backroom/Feed';
import { MicDesk } from './backroom/MicDesk';
import { useDialogFocus } from './backroom/useDialogFocus';
import '../styles/backroom-desk.css';

const ease = [0.23, 1, 0.32, 1] as const;

interface Props {
  buyer: { id: BuyerId; name: string };
  exchange: Exchange | null;
  pending: boolean;
  error: string | null;
  onAsk: (input: { audio?: Blob; text?: string }) => void;
  onClose: () => void;
}

/** The back room: corner one buyer under the lamp, speak (or type), and hear them answer in their own voice. */
export function InterrogationRoom({ buyer, exchange, pending, error, onAsk, onClose }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const still = useReducedMotion();
  const [draft, setDraft] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const ask = (input: { audio?: Blob; text?: string }) => {
    setAsked(input.text ?? null);
    onAsk(input);
  };
  useDialogFocus(ref, onClose);
  const titled = buyer.name.startsWith('The ');
  const first = titled ? buyer.name.slice(4) : buyer.name.split(' ')[0];
  const lead = titled ? buyer.name : first;
  const mid = titled ? `the ${first}` : first;
  const view = exchange ? 'answer' : pending ? 'wait' : 'ask';
  const swap = still ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.26, ease } };

  return (
    <motion.div className="br" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <motion.section
        ref={ref}
        className="br-monitor"
        role="dialog"
        aria-modal="true"
        aria-label={`Interrogating ${buyer.name}`}
        initial={still ? false : { scale: 0.985, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease }}
      >
        <Feed id={buyer.id} name={buyer.name} cracked={(exchange?.pressure ?? 0) >= 4} waiting={pending && !exchange} />

        <div className="br-desk desk">
          <div className="lamp-pool" style={{ ['--lx' as string]: '30%', ['--ly' as string]: '0%' }} aria-hidden />
          <header className="br-top">
            <p className="label">The back room</p>
            <button className="br-leave typed-link" onClick={onClose} aria-label="Leave the back room">
              Leave the back room <span aria-hidden>✕</span>
            </button>
          </header>
          <div className="br-main">
          <p className="br-rule">
            <span className="telegram-strip">One question a day. Make it count.</span>
          </p>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} className="br-stage" {...swap}>
              {view === 'ask' && (
                <>
                  <p className="br-lede ui">
                    Lean on {mid}. Say what you know, what you will do, what they stand to lose. {lead} answers out loud, in
                    their own voice.
                  </p>
                  <MicDesk name={first} error={error} text={draft} setText={setDraft} onAsk={ask} />
                  <p className="br-keep typed">What you say here stays with them when you offer leniency.</p>
                </>
              )}
              {view === 'wait' && (
                <div className="br-wait" role="status">
                  <p className="br-asked paper paper--aged typed">
                    <span className="answer-who">Q.</span>
                    {asked ? `“${asked}”` : 'Your recording, on its way to the transcriber.'}
                  </p>
                  <p className="br-breath spoken">{lead} takes a long breath…</p>
                  <p className="typed br-wait-sub">
                    The tape is running. Their answer comes back in their own voice<span className="br-dots" aria-hidden>...</span>
                  </p>
                </div>
              )}
              {view === 'answer' && exchange && <Answer exchange={exchange} name={lead} onClose={onClose} />}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
