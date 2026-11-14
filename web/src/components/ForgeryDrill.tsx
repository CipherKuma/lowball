import { motion } from 'motion/react';
import { useState } from 'react';
import type { ForgeAttempt, ForgeResponse } from '../../../shared/api';
import { BUYER_NAMES } from '../../../shared/api';
import { audio } from '../lib/audio';
import { txUrl } from '../lib/wallet';

const LABEL: Record<ForgeAttempt['kind'], { title: string; how: string }> = {
  forge: {
    title: 'Forge a confession',
    how: "We sign a confession with a key that isn't the buyer's and send it from the buyer's own account.",
  },
  replay: {
    title: "Replay another season's pact",
    how: 'We hand the contract signatures that were valid, but for a different season.',
  },
  late: {
    title: 'Confess after the case is closed',
    how: 'We try to slash the bonds again once the season has ended.',
  },
};

/** "Try to cheat": real testnet transactions the contract must refuse (server POST /forge). */
export function ForgeryDrill({ run }: { run: () => Promise<ForgeResponse> }) {
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');
  const [result, setResult] = useState<ForgeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setState('running');
    setError(null);
    try {
      const r = await run();
      setResult(r);
      setState('idle');
      r.attempts.forEach((a, i) => window.setTimeout(() => audio.sfx(a.ok ? 'wax_seal' : 'refusal_thud', 0.8), 400 + i * 450));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The drill could not run.');
      setState('error');
    }
  };

  return (
    <div className="drill">
      <p className="drill-intro">
        Could the house, or anyone, fake a confession and take the bonds? Try it. These are real NEAR testnet
        transactions; the Lowball contract has to refuse every one.
      </p>
      {!result && (
        <button className="btn btn-primary" onClick={() => void go()} disabled={state === 'running'}>
          {state === 'running' ? 'Sending the forgeries on-chain…' : 'Try to cheat the contract'}
        </button>
      )}
      {error && <p className="setup-error">{error}</p>}
      {result && (
        <ol className="drill-list">
          {result.attempts.map((a, i) => (
            <motion.li
              key={a.kind + a.tx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.45, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            >
              <div>
                <strong>{LABEL[a.kind].title}</strong>
                <p>{LABEL[a.kind].how}</p>
                <p className="mono drill-meta">
                  {BUYER_NAMES[a.buyer]} · season #{a.seasonId}
                  {a.tx ? (
                    <>
                      {' · '}
                      <a href={txUrl(a.tx)} target="_blank" rel="noreferrer">
                        {a.tx.slice(0, 8)}… ↗
                      </a>
                    </>
                  ) : (
                    ' · could not be sent'
                  )}
                </p>
              </div>
              <motion.span
                className="drill-stamp"
                data-ok={a.ok || undefined}
                initial={{ opacity: 0, scale: 1.7, rotate: -12 }}
                animate={{ opacity: 1, scale: 1, rotate: -6 }}
                transition={{ delay: 0.55 + i * 0.45, type: 'spring', duration: 0.45, bounce: 0.25 }}
              >
                {a.ok ? 'ACCEPTED?!' : 'REFUSED'}
                <small>{a.errorCode ?? a.note}</small>
              </motion.span>
            </motion.li>
          ))}
          {result.skipped?.map((s) => (
            <li key={s.kind} className="drill-skipped">
              <div>
                <strong>{LABEL[s.kind].title}</strong>
                <p>Not run: {s.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
