import { useState } from 'react';
import type { BuyerId, CasefileResponse } from '../../../../shared/api';
import { BUYER_NAMES } from '../../../../shared/api';
import { recheckPact, type SigResult } from '../../lib/sigcheck';
import { Stamp } from '../ui/Stamp';

/** The signed pact as a paper document: five signatures, each stamped VERIFIED when re-checked in the browser. */
export function Pact({ data, confessor }: { data: CasefileResponse; confessor?: BuyerId }) {
  const [check, setCheck] = useState<'idle' | 'running' | SigResult[] | Error>('idle');

  if (!data.pact) {
    return (
      <article className="cf-doc paper">
        <p className="cf-doc-title sign">No pact on file</p>
        <p className="cf-doc-body typed">Fewer than two buyers agreed, so no pact was ever signed. The low bids were their own.</p>
      </article>
    );
  }
  const p = data.pact;
  const results = Array.isArray(check) ? new Map(check.map((r) => [r.signer, r])) : null;
  const passed = Array.isArray(check) ? check.filter((r) => r.ok).length : 0;
  const run = async () => {
    setCheck('running');
    try {
      setCheck(await recheckPact(data.contractId, p.messageHex, p.signatures));
    } catch (e) {
      setCheck(e instanceof Error ? e : new Error('The check could not run.'));
    }
  };

  return (
    <article className="cf-doc paper">
      <header className="cf-doc-hd">
        <p className="cf-doc-title sign">Agreement of the Pier Nine buyers</p>
        <p className="cf-doc-ref data">
          Season #{p.seasonId} · nonce {p.nonce}
        </p>
      </header>
      <p className="cf-doc-body typed">
        We, the undersigned, will bid no more than <strong className="data">{p.cap} marks</strong> on any lot in season{' '}
        <span className="data">#{p.seasonId}</span>.
      </p>

      <ol className="cf-sigs">
        {p.signatures.map((s, i) => {
          const r = results?.get(s.signer);
          return (
            <li key={s.buyer} className="cf-sig">
              <span className="cf-sig-hand spoken">{BUYER_NAMES[s.buyer]}</span>
              <span className="cf-sig-line" aria-hidden />
              <span className="cf-sig-meta data">
                <span>{s.signer}</span>
                <span>ed25519 · {s.signatureB64.slice(0, 16)}…</span>
              </span>
              <span className="cf-sig-status">
                {r ? (
                  r.ok ? (
                    <Stamp tone="verified" angle={-6 + (i % 3) * 3} delay={i * 0.12} className="stamp-rot">Verified</Stamp>
                  ) : (
                    <>
                      <Stamp angle={-5} delay={i * 0.12} className="stamp-rot">Failed</Stamp>
                      <span className="cf-sig-why typed">{r.note ?? 'signature did not match'}</span>
                    </>
                  )
                ) : (
                  <span className="cf-sig-why typed">Checked by the contract on-chain</span>
                )}
                {s.buyer === confessor && <span className="cf-sig-talked typed">turned it in</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="cf-recheck">
        <button className="ticket" onClick={() => void run()} disabled={check === 'running'} aria-busy={check === 'running'}>
          Re-check every signature in your browser
        </button>
        <p className="cf-recheck-note typed" aria-live="polite">
          {check === 'running'
            ? 'Fetching each buyer’s key from the contract and checking the signed bytes…'
            : check instanceof Error
              ? `The check could not run: ${check.message}`
              : Array.isArray(check)
                ? `${passed} of ${check.length} signatures verified in your browser, against the keys the contract holds.`
                : 'Fetches each buyer’s key from the contract and verifies the exact signed bytes here. No trust in us required.'}
        </p>
      </div>
      <details className="cf-bytes">
        <summary className="typed">Exact signed bytes</summary>
        <code className="data">LOWBALL-PACT-v1: ‖ borsh(pact) = {p.messageHex}</code>
      </details>
    </article>
  );
}
