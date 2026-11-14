import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Backdrop } from './components/Backdrop';
import { CaseFile } from './components/CaseFile';
import { Identity } from './components/Identity';
import { Room } from './components/Room';
import { Setup } from './components/Setup';
import { Title } from './components/Title';
import { TopBar } from './components/TopBar';
import { Tutorial } from './components/tutorial/Tutorial';
import { MaterialDefs } from './components/ui/MaterialDefs';
import { audio } from './lib/audio';
import { connectEthereum, EvmError } from './lib/evm';
import { useIdentity } from './lib/identity';
import { useGame } from './lib/useGame';

type Screen = 'title' | 'tutorial' | 'identity' | 'setup' | 'room' | 'case';
const TUTORIAL_KEY = 'lowball.tutorial.v1';
const readDone = () => {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === 'done';
  } catch {
    return false;
  }
};

export function App() {
  const g = useGame();
  const id = useIdentity();
  const [screen, setScreen] = useState<Screen>('title');
  const [tutorialDone, setTutorialDone] = useState(readDone);
  const [chosen, setChosen] = useState<'guest' | 'wallet' | null>(null);
  const [evm, setEvm] = useState<{ address: string | null; busy: boolean; error: string | null }>({ address: null, busy: false, error: null });
  const connectEvm = async () => {
    setEvm({ address: null, busy: true, error: null });
    try {
      const { address } = await connectEthereum();
      setEvm({ address, busy: false, error: null });
    } catch (e) {
      setEvm({ address: null, busy: false, error: e instanceof EvmError ? e.message : 'The Ethereum wallet did not answer.' });
    }
  };
  const { view } = g;

  const walletReady = id.status === 'ready' && id.kind === 'wallet' && !!id.accountId;
  // Signed in with an Ethereum wallet (0x NEAR account): that address is the default Chain Signatures payout.
  const [payNear, setPayNear] = useState(false);
  const payoutAddress = evm.address ?? (payNear ? null : id.evmAddress ?? null);
  const openTutorial = () => {
    audio.unlock();
    setScreen('tutorial');
  };
  // Wallet first: the landing's main button opens NEAR Connect; once signed in, the walkthrough (first visit) then the licence.
  const connectFromTitle = () => {
    audio.unlock();
    setChosen('wallet');
    if (walletReady) setScreen(tutorialDone ? 'identity' : 'tutorial');
    else void id.connectWallet();
  };
  useEffect(() => {
    if (screen === 'title' && chosen === 'wallet' && walletReady) setScreen(tutorialDone ? 'identity' : 'tutorial');
  }, [screen, chosen, walletReady, tutorialDone]);
  const judgeDemo = () => {
    audio.unlock();
    setChosen('guest');
    if (tutorialDone) begin('guest');
    else setScreen('tutorial');
  };
  const tutorialFinished = () => {
    try {
      localStorage.setItem(TUTORIAL_KEY, 'done');
    } catch {
      /* private mode: the walkthrough shows again next visit */
    }
    setTutorialDone(true);
    if (chosen === 'guest') begin('guest');
    else setScreen('identity');
  };
  const begin = (mode: 'guest' | 'wallet') => {
    audio.unlock();
    audio.playMusic('harbour_loop', 2400);
    audio.sfx('foghorn', 0.35);
    audio.say('intro_1');
    audio.say('intro_2');
    setChosen(mode);
    if (mode === 'guest') id.playAsGuest();
    setScreen('setup');
    g.start({ mode, payoutEvm: mode === 'wallet' ? payoutAddress ?? undefined : evm.address ?? undefined });
  };

  // Setup ends when the first lot is on the zinc.
  const current: Screen = screen === 'setup' && view.lot ? 'room' : screen;
  const bg =
    current === 'case' ? '/art/bg_casefile.webp' : current === 'title' || current === 'identity' ? '/art/bg_pier_title.webp' : '/art/bg_auction.webp';
  const tense = view.leniencyOpen && !view.slashed && !view.holdout;
  const front = current === 'title' || current === 'tutorial' || current === 'identity';
  const kindNow = g.meta?.playerKind ?? chosen ?? 'guest';

  return (
    <>
      <MaterialDefs />
      <Backdrop
        src={bg}
        dim={current === 'title' ? 0.3 : current === 'identity' || current === 'tutorial' ? 0.55 : current === 'case' ? 0.35 : tense ? 0.35 : 0.12}
        tense={tense}
      />
      <div className="app">
        {!front && <TopBar txs={view.txs} player={view.playerAccountId} seasonId={view.seasonId} mode={view.mode} playerKind={kindNow} />}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          >
            {current === 'title' && (
              <Title
                onConnect={connectFromTitle}
                onJudgeDemo={judgeDemo}
                onHowTo={openTutorial}
                starting={g.pending === 'start'}
                tutorialDone={tutorialDone}
                wallet={{ status: id.kind === 'guest' ? 'idle' : id.status, accountId: id.kind === 'wallet' ? id.accountId : null, error: id.error }}
              />
            )}
            {current === 'tutorial' && <Tutorial onDone={tutorialFinished} />}
            {current === 'identity' && (
              <Identity
                status={id.kind === 'guest' ? 'idle' : id.status}
                accountId={id.kind === 'wallet' ? id.accountId : null}
                error={id.error}
                starting={g.pending === 'start'}
                onConnect={() => {
                  setChosen('wallet');
                  void id.connectWallet();
                }}
                onJudgeDemo={() => begin('guest')}
                onDisconnect={() => {
                  setChosen(null);
                  void id.disconnect();
                }}
                onBegin={() => begin('wallet')}
                payout={{
                  ...evm,
                  address: payoutAddress,
                  onConnect: () => {
                    setPayNear(false);
                    void connectEvm();
                  },
                  onClear: () => {
                    setPayNear(true);
                    setEvm({ address: null, busy: false, error: null });
                  },
                }}
              />
            )}
            {current === 'setup' && (
              <Setup
                meta={g.meta}
                view={view}
                error={g.failure?.message ?? null}
                errorCode={g.failure?.code}
                onRetry={g.failure?.retry}
                playerKind={kindNow}
              />
            )}
            {current === 'room' && g.meta && (
              <Room
                meta={g.meta}
                view={view}
                pending={g.pending}
                act={g.act}
                offerLeniency={g.offerLeniency}
                leniencyStage={g.leniencyState === 'idle' ? undefined : g.leniencyState}
                playerKind={kindNow}
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
                  g.start({ mode: chosen ?? undefined, payoutEvm: chosen === 'guest' ? evm.address ?? undefined : payoutAddress ?? undefined });
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
