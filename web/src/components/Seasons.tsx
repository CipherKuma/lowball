import type { SeasonSummary } from '../../../shared/api';
import { shortAddress } from '../lib/evm';
import type { SeasonsState } from '../lib/seasons';
import { accountUrl, yoctoToNear } from '../lib/wallet';
import { Stamp } from './ui/Stamp';

interface Props {
  seasons: SeasonsState;
  walletAccount: string | null;
  canResume: (s: SeasonSummary) => boolean;
  onResume: (s: SeasonSummary) => void;
  onOpenCase: (s: SeasonSummary) => void;
  onBack: () => void;
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const shortAccount = (id: string) => (id.length > 26 ? `${id.slice(0, 12)}…${id.slice(-10)}` : id);

function verdict(s: SeasonSummary, name: (id: string) => string) {
  if (!s.closed) return { stamp: 'In play', tone: 'carbon' as const, line: `Day ${Math.max(1, s.day)} of ${s.days}. The ring is still bidding.` };
  if (s.confessor) return { stamp: 'Confessed', tone: 'verified' as const, line: `${name(s.confessor)} talked. The other bonds were slashed.` };
  return { stamp: 'Nobody talked', tone: 'red' as const, line: 'The season closed with no confession. Every bond went back.' };
}

/** "Your seasons": every season this player started, newest first. Open ones resume; closed ones reopen their case file. */
export function Seasons({ seasons, walletAccount, canResume, onResume, onOpenCase, onBack }: Props) {
  const list = seasons.seasons;
  return (
    <main className="docket">
      <div className="lamp-pool" aria-hidden />
      <header className="docket-head">
        <p className="sign docket-kicker">Harbour office · your docket</p>
        <h1 className="sign docket-title">Your seasons</h1>
        <p className="typed docket-sub">
          {walletAccount
            ? `Seasons played as ${shortAccount(walletAccount)}, and any judge-demo seasons from this browser.`
            : 'Seasons started in this browser. Connect your wallet to see the ones you played with it anywhere.'}
        </p>
      </header>

      {seasons.status === 'loading' && <p className="typed docket-note" role="status">Pulling your folders from the cabinet…</p>}
      {seasons.status === 'error' && (
        <div className="docket-note docket-note--err" role="alert">
          <p className="typed">The harbour office is not answering right now.</p>
          <button className="typed-link" onClick={seasons.reload}>Try again</button>
        </div>
      )}
      {seasons.status === 'ready' && !list.length && (
        <div className="docket-empty paper paper--manila">
          <p className="spoken">No seasons on file yet.</p>
          <p className="typed">Play one season and its case file, its signatures and your payout land here.</p>
          <button className="plaque" onClick={onBack}>Back to the noticeboard</button>
        </div>
      )}

      {list.length > 0 && (
        <ol className="docket-list">
          {list.map((s, i) => {
            const name = (id: string) => s.buyers.find((b) => b.id === id)?.name ?? id;
            const v = verdict(s, name);
            const paid = s.payoutYocto && s.payoutYocto !== '0' ? yoctoToNear(s.payoutYocto, 2) : null;
            const to = s.payoutEvm ? `${shortAddress(s.payoutEvm)} on Sepolia` : shortAccount(s.playerAccountId);
            const resumable = !s.closed && canResume(s);
            return (
              <li key={s.sessionId} className={`folder paper paper--manila${i % 2 ? ' folder--tilt' : ''}`}>
                <div className="folder-tab sign">Season #{s.seasonId ?? '—'}</div>
                <div className="folder-body">
                  <div className="folder-top">
                    <p className="typed folder-when">{when(s.createdAt)} · {s.playerKind === 'wallet' ? 'your wallet' : 'judge demo'}</p>
                    <Stamp tone={v.tone} angle={i % 2 ? 5 : -6} className="folder-stamp">{v.stamp}</Stamp>
                  </div>
                  <p className="spoken folder-line">{v.line}</p>
                  <dl className="folder-facts">
                    <div>
                      <dt className="label">Player</dt>
                      <dd className="typed"><a href={accountUrl(s.playerAccountId)} target="_blank" rel="noreferrer">{shortAccount(s.playerAccountId)} ↗</a></dd>
                    </div>
                    <div>
                      <dt className="label">Paid to you</dt>
                      <dd className="typed">{paid ? `${paid} Ⓝ → ${to}` : s.closed ? 'nothing' : 'not yet'}</dd>
                    </div>
                  </dl>
                  <div className="folder-actions">
                    {s.closed ? (
                      <button className="plaque folder-btn" onClick={() => onOpenCase(s)}>Open case file</button>
                    ) : resumable ? (
                      <button className="plaque folder-btn" onClick={() => onResume(s)}>Resume season</button>
                    ) : (
                      <p className="typed folder-locked">
                        {s.playerKind === 'wallet' ? `Sign in as ${shortAccount(s.playerAccountId)} to pick this up.` : 'Started in another browser; it can only be picked up there.'}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {list.length > 0 && (
        <button className="typed-link docket-back" onClick={onBack}>← Back to the noticeboard</button>
      )}
    </main>
  );
}
