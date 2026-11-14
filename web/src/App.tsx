import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Backdrop } from './components/Backdrop';
import { CaseFile } from './components/CaseFile';
import { Room } from './components/Room';
import { Setup } from './components/Setup';
import { Title } from './components/Title';
import { TopBar } from './components/TopBar';
import { audio } from './lib/audio';
import { useGame } from './lib/useGame';

type Screen = 'title' | 'setup' | 'room' | 'case';

export function App() {
  const g = useGame();
  const [screen, setScreen] = useState<Screen>('title');
  const { view } = g;

  const begin = () => {
    audio.unlock();
    audio.playMusic('harbour_loop', 2400);
    audio.sfx('foghorn', 0.35);
    audio.say('intro_1');
    audio.say('intro_2');
    setScreen('setup');
    g.start();
  };

  // Setup ends when the first lot is on the zinc.
  const current: Screen = screen === 'setup' && view.lot ? 'room' : screen;
  const bg = current === 'case' ? '/art/bg_casefile.webp' : current === 'title' ? '/art/bg_pier_title.webp' : '/art/bg_auction.webp';
  const tense = view.leniencyOpen && !view.slashed && !view.holdout;

  return (
    <>
      <Backdrop src={bg} dim={current === 'title' ? 0.25 : current === 'case' ? 0.35 : tense ? 0.35 : 0.12} tense={tense} />
      <div className="app">
        {current !== 'title' && <TopBar txs={view.txs} player={view.playerAccountId} seasonId={view.seasonId} />}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          >
            {current === 'title' && <Title onStart={begin} starting={g.pending === 'start'} />}
            {current === 'setup' && (
              <Setup
                meta={g.meta}
                view={view}
                error={g.failure?.message ?? null}
                errorCode={g.failure?.code}
                onRetry={g.failure?.retry}
              />
            )}
            {current === 'room' && g.meta && (
              <Room
                meta={g.meta}
                view={view}
                pending={g.pending}
                act={g.act}
                offerLeniency={g.offerLeniency}
                openCase={() => setScreen('case')}
                interro={{
                  ask: (buyer, input) => void g.interrogate(buyer, input),
                  usedToday: g.interrogatedToday,
                  pending: g.interroPending,
                  error: g.interroError,
                  clearError: g.clearInterroError,
                }}
              />
            )}
            {current === 'case' && (
              <CaseFile
                load={g.loadCasefile}
                view={view}
                wiretapUrl={g.wiretapUrl()}
                forge={g.forge}
                onReplay={() => {
                  setScreen('setup');
                  g.start();
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {g.failure && current !== 'setup' && (
          <motion.div className="toast" role="alert" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
            <span>{g.failure.message}</span>
            {g.failure.retry && <button className="btn btn-ghost" onClick={g.failure.retry}>Try again</button>}
            <button className="toast-x" aria-label="Dismiss" onClick={g.dismissFailure}>×</button>
          </motion.div>
        )}
      </AnimatePresence>
      {g.preview && <div className="preview-badge">Preview · scripted season, not on-chain</div>}
    </>
  );
}
