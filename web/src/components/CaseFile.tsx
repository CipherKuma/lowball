import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { BuyerId, CasefileResponse, ForgeResponse } from '../../../shared/api';
import { ForgeryDrill } from './ForgeryDrill';
import { BUYER_NAMES } from '../../../shared/api';
import { audio } from '../lib/audio';
import type { View } from '../lib/state';
import { accountUrl, txUrl } from '../lib/wallet';
import { recheckPact, type SigResult } from '../lib/sigcheck';
import { Wiretap } from './Wiretap';

type Tab = 'pact' | 'room' | 'chain' | 'cheat';
const ease = [0.23, 1, 0.32, 1] as const;

export function CaseFile({
  load,
  view,
  wiretapUrl,
  forge,
  onReplay,
}: {
  load: () => Promise<CasefileResponse>;
  view: View;
  wiretapUrl: string | null;
  forge: () => Promise<ForgeResponse>;
  onReplay: () => void;
}) {
  const [data, setData] = useState<CasefileResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pact');

  useEffect(() => {
    audio.sfx('folder_open', 0.7);
    load().then(setData, (e: Error) => setErr(e.message));
  }, [load]);

  const verified = data?.receipts.filter((r) => r.verification.verified).length ?? 0;
  const confessor = view.slashed?.confessor;

  return (
    <main className="casefile">
      <motion.div className="folder" initial={{ y: 40, opacity: 0, rotate: -1.2 }} animate={{ y: 0, opacity: 1, rotate: -0.4 }} transition={{ duration: 0.7, ease }}>
        <div className="folder-tab display">Case file · Season #{data?.seasonId ?? view.seasonId ?? '—'}</div>
        <header className="folder-head">
          <div>
            <p className="folder-kicker">The harbour vs. the Pier Nine ring</p>
            <h2 className="display">{confessor ? `${BUYER_NAMES[confessor]} talked.` : 'Nobody talked.'}</h2>
          </div>
          <dl className="folder-facts mono">
            <div><dt>Taken from you</dt><dd>{view.shortfallTotal} marks</dd></div>
            <div><dt>Model receipts verified</dt><dd>{data ? `${verified}/${data.receipts.length}` : '…'}</dd></div>
            <div><dt>Model</dt><dd>{data?.model ?? '…'}</dd></div>
          </dl>
        </header>
        <nav className="folder-tabs" role="tablist">
          {(
            [
              ['pact', 'The pact'],
              ['room', 'The back room'],
              ['chain', 'On-chain record'],
              ['cheat', 'Try to cheat'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { audio.sfx('paper_slide', 0.4); setTab(k); }}>
              {label}
            </button>
          ))}
        </nav>
        <section className="folder-body">
          {err && <p className="setup-error">The case file would not open: {err}</p>}
          {!data && !err && <p className="folder-loading">Pulling the file…</p>}
          {data && tab === 'pact' && <Pact data={data} confessor={confessor} />}
          {data && tab === 'room' && (
            <>
              <Wiretap url={wiretapUrl} />
              <BackRoom data={data} />
            </>
          )}
          {data && tab === 'chain' && <Chain data={data} view={view} />}
          {tab === 'cheat' && <ForgeryDrill run={forge} />}
        </section>
        <footer className="folder-foot">
          <button className="btn btn-amber" onClick={onReplay}>Play another season</button>
        </footer>
      </motion.div>
    </main>
  );
}

function Pact({ data, confessor }: { data: CasefileResponse; confessor?: BuyerId }) {
  const [check, setCheck] = useState<'idle' | 'running' | SigResult[]>('idle');
  if (!data.pact) return <p>No pact was ever signed: fewer than two buyers agreed. The low bids were their own.</p>;
  const p = data.pact;
  const results = Array.isArray(check) ? new Map(check.map((r) => [r.signer, r])) : null;
  const runCheck = async () => {
    setCheck('running');
    setCheck(await recheckPact(data.contractId, p.messageHex, p.signatures));
  };
  return (
    <div className="pact-doc">
      <p className="pact-title display">Agreement of the Pier Nine buyers</p>
      <p className="pact-body">
        We, the undersigned, will bid no more than <strong className="mono">{p.cap} marks</strong> on any lot in season{' '}
        <span className="mono">#{p.seasonId}</span>. Nonce <span className="mono">{p.nonce}</span>.
      </p>
      <ul className="sigs">
        {p.signatures.map((s) => (
          <li key={s.buyer} data-confessor={s.buyer === confessor || undefined}>
            <span className="sig-name display">{BUYER_NAMES[s.buyer]}</span>
            <code className="mono">{s.signatureB64.slice(0, 22)}…</code>
            <span className="sig-ok" data-fail={results?.get(s.signer)?.ok === false || undefined}>
              {results?.get(s.signer)
                ? results.get(s.signer)!.ok
                  ? 'ed25519 ✓ re-checked in your browser'
                  : `✗ ${results.get(s.signer)!.note ?? 'failed'}`
                : 'ed25519 ✓ checked on-chain'}
            </span>
          </li>
        ))}
      </ul>
      <div className="recheck">
        <button className="btn btn-ghost" onClick={() => void runCheck()} disabled={check === 'running'}>
          {check === 'running' ? 'Checking…' : 'Re-check every signature in your browser'}
        </button>
        <span>Fetches each buyer's key from the contract and verifies the exact signed bytes locally. No trust in us required.</span>
      </div>
      <details className="pact-bytes">
        <summary>Exact signed bytes</summary>
        <code className="mono">LOWBALL-PACT-v1: ‖ borsh(pact) = {p.messageHex}</code>
      </details>
    </div>
  );
}

function BackRoom({ data }: { data: CasefileResponse }) {
  const byChat = new Map(data.receipts.map((r) => [r.chatId, r]));
  return (
    <ol className="transcript">
      {data.channel.map((m, i) => {
        const r = byChat.get(m.chatId);
        return (
          <motion.li key={m.chatId + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
            <img src={`/art/${m.buyer}_calm.webp`} alt="" />
            <div>
              <p className="t-who">
                {BUYER_NAMES[m.buyer]} <span className="mono">round {m.round} · cap {m.proposeCap} · {m.sign ? 'signs' : 'refuses'}</span>
              </p>
              <p className="t-say">“{m.say}”</p>
              {r && (
                <p className="t-receipt mono" data-ok={r.verification.verified || undefined}>
                  {r.verification.verified ? 'NEAR AI receipt verified' : `receipt not verified${r.verification.error ? `: ${r.verification.error}` : ''}`} · {m.chatId.slice(0, 18)}…
                </p>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

function Chain({ data, view }: { data: CasefileResponse; view: View }) {
  const txs = data.txs.length ? data.txs.map((t) => ({ label: t.label, hash: t.hash, ok: t.ok, code: t.errorCode })) : view.txs.map((t) => ({ label: t.label, hash: t.tx, ok: true, code: undefined }));
  return (
    <div>
      <p className="chain-head">
        Contract <a className="mono" href={accountUrl(data.contractId)} target="_blank" rel="noreferrer">{data.contractId} ↗</a> · You{' '}
        <a className="mono" href={accountUrl(data.playerAccountId)} target="_blank" rel="noreferrer">{data.playerAccountId.split('.')[0]} ↗</a>
      </p>
      <ol className="chain-list">
        {txs.map((t, i) => (
          <li key={t.hash + i} data-fail={!t.ok || undefined}>
            <span>{t.label}{t.code ? ` · ${t.code}` : ''}</span>
            <a className="mono" href={txUrl(t.hash)} target="_blank" rel="noreferrer">{t.hash.slice(0, 8)}… ↗</a>
          </li>
        ))}
      </ol>
    </div>
  );
}
