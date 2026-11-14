import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type { ForgeAttempt, ForgeKind, ForgeResponse } from '../../../shared/api';
import { BUYER_NAMES } from '../../../shared/api';
import { audio } from '../lib/audio';
import { txUrl } from '../lib/wallet';
import { Stamp } from './ui/Stamp';

const KINDS: ForgeKind[] = ['forge', 'replay', 'late'];
const LABEL: Record<ForgeKind, { title: string; how: string }> = {
  forge: { title: 'Forge a confession', how: "We sign a confession with a key that isn't the buyer's and send it from the buyer's own account." },
  replay: { title: "Replay another season's pact", how: 'We hand the contract signatures that were valid, but for a different season.' },
  late: { title: 'Confess after the case is closed', how: 'We try to slash the bonds again once the season has ended.' },
};
const STEP = 0.45;

function Forgery({ kind, n, attempt, skipped, running }: { kind: ForgeKind; n: number; attempt?: ForgeAttempt; skipped?: string; running: boolean }) {
  const breach = attempt?.ok === true;
  return (
    <li className="cf-forgery paper paper--aged" data-breach={breach || undefined} data-done={!!attempt || undefined}>
      <p className="cf-forgery-no data">Exhibit F-{n}</p>
      <p className="cf-forgery-title sign">{LABEL[kind].title}</p>
      <p className="cf-forgery-how typed">{LABEL[kind].how}</p>
      {attempt && (
        <p className="cf-forgery-meta data">
          {BUYER_NAMES[attempt.buyer]} · season #{attempt.seasonId} ·{' '}
          {attempt.tx ? (
            <a href={txUrl(attempt.tx)} target="_blank" rel="noreferrer">
              tx {attempt.tx.slice(0, 6)}…{attempt.tx.slice(-4)} ↗
            </a>
          ) : (
            'could not be sent'
          )}
        </p>
      )}
      {running && !attempt && <p className="cf-forgery-sending typed">Sending to the contract<span className="cf-dots" aria-hidden>...</span></p>}
      <div className="cf-forgery-verdict" aria-live="polite">
        {attempt && !breach && (
          <>
            <Stamp angle={-9} delay={0.3 + (n - 1) * STEP} className="stamp-rot cf-refused">Refused</Stamp>
            <span className="cf-forgery-code data">{attempt.errorCode ?? attempt.note}</span>
          </>
        )}
        {breach && (
          <>
            <Stamp tone="on-dark" angle={-4} delay={0.3 + (n - 1) * STEP} className="stamp-rot cf-refused">Accepted?!</Stamp>
            <span className="cf-forgery-code typed">The contract accepted a forgery. This should never happen: report it.</span>
          </>
        )}
        {skipped && (
          <>
            <Stamp tone="carbon" angle={-5} className="stamp-rot">Not run</Stamp>
            <span className="cf-forgery-code typed">{skipped}</span>
          </>
        )}
      </div>
    </li>
  );
}

/** "Try to cheat": real testnet transactions the contract must refuse (server POST /forge). */
export function ForgeryDrill({ run }: { run: () => Promise<ForgeResponse> }) {
  const still = useReducedMotion();
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
      r.attempts.forEach((a, i) => window.setTimeout(() => audio.sfx(a.ok ? 'wax_seal' : 'refusal_thud', 0.8), 300 + i * STEP * 1000));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The drill could not run.');
      setState('error');
    }
  };

  const refused = result?.attempts.filter((a) => !a.ok).length ?? 0;
  const breaches = result?.attempts.filter((a) => a.ok).length ?? 0;
  const shown = result ? KINDS.filter((k) => result.attempts.some((a) => a.kind === k) || result.skipped?.some((s) => s.kind === k)) : KINDS;

  return (
    <div className="cf-drill">
      <div className="cf-drill-hd">
        <p className="cf-doc-title sign">Try to cheat the contract</p>
        <p className="ui">
          Could the house, or anyone, fake a confession and take the bonds? Here are three forgeries. They go out as real NEAR
          testnet transactions, and the Lowball contract has to refuse every one.
        </p>
      </div>
      <ol className="cf-forgeries">
        {shown.map((k, i) => (
          <Forgery
            key={k}
            kind={k}
            n={i + 1}
            attempt={result?.attempts.find((a) => a.kind === k)}
            skipped={result?.skipped?.find((s) => s.kind === k)?.reason}
            running={state === 'running'}
          />
        ))}
      </ol>
      {!result && (
        <div className="cf-drill-go">
          <button className="ticket" onClick={() => void go()} disabled={state === 'running'} aria-busy={state === 'running'}>
            {state === 'running' ? 'Sending the forgeries on-chain…' : 'Try to cheat the contract'}
          </button>
          <span className="plaque-note">Three real transactions on NEAR testnet.</span>
        </div>
      )}
      {error && (
        <p className="cf-error typed" role="alert">
          {error}
        </p>
      )}
      {result && (
        <motion.p
          className="cf-drill-sum sign"
          data-breach={breaches > 0 || undefined}
          initial={still ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 + result.attempts.length * STEP, duration: 0.3 }}
        >
          {breaches > 0 ? `${breaches} forger${breaches === 1 ? 'y' : 'ies'} got through.` : `${refused} of ${result.attempts.length} refused by the contract.`}
        </motion.p>
      )}
    </div>
  );
}
