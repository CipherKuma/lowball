import type { CasefileResponse } from '../../../../shared/api';
import type { View } from '../../lib/state';
import { accountUrl, txUrl } from '../../lib/wallet';

const short = (h: string) => (h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);

/** Every transaction this season sent to NEAR, as a typed receipt roll with explorer links. */
export function Chain({ data, view }: { data: CasefileResponse; view: View }) {
  const txs = data.txs.length
    ? data.txs.map((t) => ({ label: t.label, hash: t.hash, ok: t.ok, code: t.errorCode }))
    : view.txs.map((t) => ({ label: t.label, hash: t.tx, ok: true, code: undefined }));
  const refused = txs.filter((t) => !t.ok).length;

  return (
    <article className="cf-roll paper paper--telegram">
      <header className="cf-roll-hd">
        <p className="sign">On-chain record</p>
        <p className="typed">
          {txs.length} transaction{txs.length === 1 ? '' : 's'} on NEAR testnet{refused ? ` · ${refused} refused by the contract` : ''}
        </p>
      </header>
      <dl className="cf-roll-who">
        <div>
          <dt className="label">Contract</dt>
          <dd>
            <a className="data" href={accountUrl(data.contractId)} target="_blank" rel="noreferrer">
              {data.contractId} ↗
            </a>
          </dd>
        </div>
        <div>
          <dt className="label">Your NEAR account</dt>
          <dd>
            <a className="data" href={accountUrl(data.playerAccountId)} target="_blank" rel="noreferrer">
              {data.playerAccountId} ↗
            </a>
          </dd>
        </div>
      </dl>
      {txs.length === 0 ? (
        <p className="cf-empty typed">No transactions were recorded for this season.</p>
      ) : (
        <ol className="cf-txs">
          {txs.map((t, i) => (
            <li key={t.hash + i} data-fail={!t.ok || undefined}>
              <span className="cf-tx-n data">{String(i + 1).padStart(2, '0')}</span>
              <span className="cf-tx-label typed">
                {t.label}
                {t.code && <span className="cf-tx-code data"> · refused {t.code}</span>}
              </span>
              <span className="cf-tx-dots" aria-hidden />
              <a className="cf-tx-hash data" href={txUrl(t.hash)} target="_blank" rel="noreferrer" aria-label={`${t.label}, transaction ${short(t.hash)}`}>
                {short(t.hash)} ↗
              </a>
            </li>
          ))}
        </ol>
      )}
      <p className="cf-roll-end typed">— end of record —</p>
    </article>
  );
}
