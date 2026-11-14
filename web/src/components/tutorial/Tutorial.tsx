import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuyerId } from '../../../../shared/api';
import { audio } from '../../lib/audio';
import { ANSWER, QUESTIONS, STEPS, TELL } from './steps';
import { TutorialDesk } from './TutorialDesk';

const ease = [0.23, 1, 0.32, 1] as const;

/** A one-minute, semi-playable walkthrough on a miniature table. Off-chain. Skippable at every step. */
export function Tutorial({ onDone }: { onDone: (skipped: boolean) => void }) {
  const [i, setI] = useState(0);
  const [sold, setSold] = useState(false);
  const [days, setDays] = useState(0);
  const [room, setRoom] = useState<'closed' | 'open' | 'thinking' | 'answered'>('closed');
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [offer, setOffer] = useState<'none' | 'counting' | 'done'>('none');
  const [blocks, setBlocks] = useState(200);
  const timers = useRef<number[]>([]);
  const step = STEPS[i];
  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const skip = useCallback(() => onDone(true), [onDone]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && room === 'closed' && skip();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip, room]);

  const go = (id: string) => setI(STEPS.findIndex((s) => s.id === id));
  const sell = () => {
    if (step.id !== 'sell') return;
    audio.sfx('paper_slide', 0.5);
    setSold(true);
    setDays(1);
    later(520, () => audio.sfx('card_flip', 0.5));
    later(1500, () => go('tell'));
  };
  const lean = (id: BuyerId) => {
    if (step.id !== 'lean') return;
    if (id !== 'sully') {
      setHint('For the walkthrough, pick Sully. In a real season, anyone.');
      return;
    }
    setHint(null);
    audio.sfx('folder_open', 0.45);
    setRoom('open');
    go('ask');
  };
  const ask = (q: string) => {
    if (q.trim().split(/\s+/).length < 3) {
      setHint('Give him a full question, at least a few words.');
      return;
    }
    setHint(null);
    setText(q);
    setRoom('thinking');
    later(1300, () => {
      setRoom('answered');
      go('pressure');
    });
  };
  const leave = () => {
    setRoom('closed');
    setDays(2);
    go('case');
  };
  const offerIt = () => {
    if (step.id !== 'offer') return;
    audio.sfx('wax_seal', 0.55);
    setOffer('counting');
    let b = 200;
    const tick = window.setInterval(() => {
      b = Math.max(0, b - 23);
      setBlocks(b);
    }, 90);
    timers.current.push(tick as unknown as number);
    later(1500, () => {
      window.clearInterval(tick);
      audio.sfx('bond_slash', 0.55);
      setOffer('done');
      go('done');
    });
  };

  return (
    <main className="tut desk">
      <div className="lamp-pool" aria-hidden />
      <header className="tut-head">
        <p className="stencil tut-kicker">Walkthrough · example season, nothing on-chain</p>
        <button className="typed-link tut-skip" onClick={skip}>Skip the walkthrough</button>
      </header>

      <TutorialDesk
        lit={step.lit}
        sold={sold}
        days={days}
        pressure={room === 'answered' || i > STEPS.findIndex((s) => s.id === 'pressure') ? 2 : 0}
        offer={offer}
        blocks={blocks}
        canSell={step.id === 'sell'}
        canLean={step.id === 'lean'}
        canOffer={step.id === 'offer'}
        onSell={sell}
        onLean={lean}
        onOffer={offerIt}
      />

      <AnimatePresence>
        {room !== 'closed' && (
          <motion.div className="tut-room-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="tut-room camera" role="dialog" aria-label="The back room, Sully Brack" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4, ease }}>
              <p className="typed tut-room-osd"><span className="rec-dot" /> Room 2 · Pier Nine</p>
              <img className="tut-room-portrait" src={`/art/sully_${room === 'answered' ? 'cracked' : 'calm'}.webp`} alt="" />
              <div className="tut-room-body">
                <h2 className="sign tut-room-name">Sully Brack</h2>
                {room === 'open' && (
                  <>
                    <div className="tut-room-chips">
                      {QUESTIONS.map((q) => (
                        <button key={q} className="ticket tut-chip" onClick={() => ask(q)}>{q}</button>
                      ))}
                    </div>
                    <form className="tut-room-type" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
                      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="…or type your own" aria-label="What you say" maxLength={200} />
                      <button className="plaque">Say it</button>
                    </form>
                  </>
                )}
                {room === 'thinking' && <p className="spoken tut-room-wait">Sully takes a long breath…</p>}
                {room === 'answered' && (
                  <>
                    <p className="typed tut-room-q">You: “{text}”</p>
                    <p className="spoken tut-room-a">“{ANSWER}”</p>
                    <p className="typed tut-room-tell">{TELL}</p>
                    <p className="label">Pressure 2 of 6</p>
                    <button className="ticket" onClick={leave}>Back to the table</button>
                  </>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.aside key={step.id} className="tut-coach paper paper--telegram" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35, ease }} aria-live="polite">
        <p className="label tut-count">Step {i + 1} of {STEPS.length}</p>
        <p className="typed tut-line">{step.line}</p>
        {step.doThis && <p className="sign tut-do">{step.doThis}</p>}
        {hint && <p className="typed tut-hint">{hint}</p>}
        <div className="tut-coach-actions">
          {step.advance === 'next' && <button className="plaque" onClick={() => setI(i + 1)} autoFocus>Next</button>}
          {step.advance === 'done' && <button className="plaque" onClick={() => onDone(false)} autoFocus>Take your seat</button>}
        </div>
      </motion.aside>
    </main>
  );
}
