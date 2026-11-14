import type { ReactNode } from 'react';

/** A sealed kraft envelope. Set `open` to slit it: the flap lifts and the card inside rises. */
export function Envelope({ open, from, children, className = '' }: { open: boolean; from: string; children: ReactNode; className?: string }) {
  return (
    <div className={`envelope ${className}`} data-open={open || undefined} aria-label={open ? `${from}'s bid` : `${from}'s sealed bid`}>
      <div className="envelope-flap" aria-hidden />
      <div className="envelope-seal" aria-hidden />
      <div className="envelope-card">{children}</div>
      <span className="envelope-from typed">{from}</span>
    </div>
  );
}
