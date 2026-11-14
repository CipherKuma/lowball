import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

type Tone = 'red' | 'verified' | 'carbon' | 'on-dark';

/** A rubber stamp that slams onto the paper it sits on. Use for verdicts: VERIFIED, REFUSED, SLASHED, CONFESSED. */
export function Stamp({ children, tone = 'red', angle = -7, delay = 0, className = '' }: { children: ReactNode; tone?: Tone; angle?: number; delay?: number; className?: string }) {
  const still = useReducedMotion();
  const toneClass = tone === 'red' ? '' : ` stamp--${tone}`;
  return (
    <motion.span
      className={`stamp${toneClass} ${className}`}
      style={{ ['--angle' as string]: `${angle}deg`, rotate: angle }}
      initial={still ? false : { scale: 1.7, opacity: 0, rotate: angle }}
      animate={{ scale: 1, opacity: 0.88, rotate: angle }}
      transition={{ delay, duration: 0.22, ease: [0.2, 0.9, 0.25, 1.15] }}
    >
      {children}
    </motion.span>
  );
}
