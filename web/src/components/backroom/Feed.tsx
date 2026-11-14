import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { BuyerId } from '../../../../shared/api';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The camera's burned-in clock: always 4 a.m. on the pier, ticking from when you walked in. */
function useStamp() {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const d = new Date(t);
  const secs = 12 * 60 + d.getMinutes() * 60 + d.getSeconds();
  const mm = String(Math.floor(secs / 60) % 60).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}  04:${mm}:${ss}`;
}

/** The surveillance view of the interview room: one hanging lamp, one buyer under it, brackets and burn-in. */
export function Feed({ id, name, cracked, waiting }: { id: BuyerId; name: string; cracked: boolean; waiting: boolean }) {
  const stamp = useStamp();
  const face = cracked ? 'cracked' : 'calm';
  return (
    <div className="feed" data-waiting={waiting || undefined}>
      <AnimatePresence initial={false}>
        <motion.img
          key={face}
          className="feed-face"
          src={`/art/${id}_${face}.webp`}
          alt={cracked ? `${name}, rattled` : name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: cracked ? 0.9 : 0 }}
        />
      </AnimatePresence>
      <div className="feed-lamp" aria-hidden>
        <span className="feed-cord" />
        <svg className="feed-shade" viewBox="0 0 120 64">
          <path d="M44 4h32l4 12H40z" fill="#2a2016" />
          <path d="M40 15h40l36 40c-30 8-82 8-112 0z" fill="url(#shade)" />
          <ellipse cx="60" cy="55" rx="56" ry="6" fill="#ffd08a" opacity="0.9" />
          <defs>
            <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a4a3f" />
              <stop offset="1" stopColor="#16201b" />
            </linearGradient>
          </defs>
        </svg>
        <span className="feed-cone" />
      </div>
      <div className="feed-scan" aria-hidden />
      <div className="feed-osd camera" aria-hidden>
        <p className="feed-tl data">
          <span className="rec-dot" /> REC · CAM 02
        </p>
        <p className="feed-tr data">{stamp}</p>
        <div className="feed-bl">
          <p className="feed-name sign">{name}</p>
          <p className="feed-room typed">Room 2 · Pier Nine</p>
        </div>
      </div>
    </div>
  );
}
