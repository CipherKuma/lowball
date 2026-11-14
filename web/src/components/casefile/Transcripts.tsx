import { motion, useReducedMotion } from 'motion/react';
import type { CasefileResponse, Receipt } from '../../../../shared/api';
import { BUYER_NAMES } from '../../../../shared/api';
import type { View } from '../../lib/state';
import { Stamp } from '../ui/Stamp';

function ReceiptMark({ r, delay }: { r?: Receipt; delay: number }) {
  if (!r) return null;
  if (r.verification.verified)
    return (
      <Stamp tone="verified" angle={-4} delay={delay} className="stamp-rot cf-t-stamp">
        NEAR AI receipt verified
      </Stamp>
    );
  return (
    <p className="cf-t-unverified typed">
      Receipt not verified{r.verification.error ? `: ${r.verification.error}` : ''} · <span className="data">{r.chatId.slice(0, 16)}…</span>
    </p>
  );
}

/** The back room on paper: your questions and their answers, then the buyers' own pact talk, with AI receipts. */
export function Transcripts({ data, view }: { data: CasefileResponse; view: View }) {
  const still = useReducedMotion();
  const byChat = new Map(data.receipts.map((r) => [r.chatId, r]));
  const asked = data.receipts.filter((r) => r.kind === 'interrogate').sort((a, b) => a.createdAt - b.createdAt);
  const land = (i: number) => (still ? {} : { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.07, duration: 0.32 } });

  return (
    <div className="cf-trans">
      {view.interrogations.length > 0 && (
        <article className="cf-doc paper paper--aged">
          <p className="cf-doc-title sign">Your questions · Room 2</p>
          <ol className="cf-tlist">
            {view.interrogations.map((q, i) => {
              const r = asked.filter((x) => x.buyer === q.buyer)[view.interrogations.filter((y, j) => j < i && y.buyer === q.buyer).length];
              return (
                <motion.li key={q.seq} className="cf-t" {...land(i)}>
                  <img src={`/art/${q.buyer}_${q.pressure >= 4 ? 'cracked' : 'calm'}.webp`} alt="" loading="lazy" />
                  <div>
                    <p className="cf-t-who sign">
                      {BUYER_NAMES[q.buyer]} <span className="data">pressure {q.pressure}/6</span>
                    </p>
                    <p className="cf-t-q typed">Q. “{q.question}”</p>
                    <p className="cf-t-say spoken">“{q.answer}”</p>
                    <ReceiptMark r={r} delay={0.3 + i * 0.07} />
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </article>
      )}
      <article className="cf-doc paper">
        <p className="cf-doc-title sign">The pact talk</p>
        <p className="cf-doc-body typed">What the five said to each other before the season, word for word.</p>
        <ol className="cf-tlist">
          {data.channel.map((m, i) => (
            <motion.li key={m.chatId + i} className="cf-t" {...land(i)}>
              <img src={`/art/${m.buyer}_calm.webp`} alt="" loading="lazy" />
              <div>
                <p className="cf-t-who sign">
                  {BUYER_NAMES[m.buyer]}{' '}
                  <span className="data">
                    round {m.round} · cap {m.proposeCap} marks · {m.sign ? 'signs' : 'refuses'}
                  </span>
                </p>
                <p className="cf-t-say spoken">“{m.say}”</p>
                <ReceiptMark r={byChat.get(m.chatId)} delay={0.3 + i * 0.07} />
              </div>
            </motion.li>
          ))}
        </ol>
      </article>
    </div>
  );
}
