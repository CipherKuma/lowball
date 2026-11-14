import { motion, useReducedMotion } from 'motion/react';
import type { Interrogation as Exchange } from '../../lib/extra';
import { PressureGauge } from './PressureGauge';

const drop = [0.2, 0.9, 0.25, 1.15] as const;

/** What came back: a typed transcript slip (your question, their answer in their own words), the tell, the dial. */
export function Answer({ exchange, name, onClose }: { exchange: Exchange; name: string; onClose: () => void }) {
  const still = useReducedMotion();
  const land = (i: number) =>
    still ? {} : { initial: { opacity: 0, y: -12, rotate: -1.4 }, animate: { opacity: 1, y: 0, rotate: 0 }, transition: { delay: i * 0.08, duration: 0.42, ease: drop } };
  const tell = exchange.tell ? exchange.tell.charAt(0).toUpperCase() + exchange.tell.slice(1) : null;

  return (
    <div className="answer">
      <motion.article className="answer-slip paper paper--aged" {...land(0)}>
        <p className="answer-hd typed">
          <span>Transcript · Room 2</span>
          <span>{exchange.mood}</span>
        </p>
        <p className="answer-q typed">
          <span className="answer-who">Q.</span>“{exchange.question}”
        </p>
        <p className="answer-a spoken">
          <span className="answer-who typed">A.</span>“{exchange.answer}”
        </p>
        {tell && (
          <p className="answer-tell typed">
            <span className="answer-obs">Observed</span>
            {tell}
          </p>
        )}
      </motion.article>

      <motion.div className="answer-gauge" {...land(1)}>
        <PressureGauge value={exchange.pressure} />
        <div className="answer-why">
          <p className="ui">
            {exchange.pressure >= 4
              ? `${name} is rattled. At six they are close to breaking.`
              : 'A question that lands near the truth turns the needle. An empty bluff barely moves it.'}
          </p>
          <p className="typed">What you said stays with them when you offer leniency.</p>
        </div>
      </motion.div>

      <motion.div className="answer-foot" {...land(2)}>
        <button className="plaque" onClick={onClose} autoFocus>
          Back to the table
        </button>
        <span className="plaque-note">Your one question for today is spent. Come back tomorrow.</span>
      </motion.div>
    </div>
  );
}
