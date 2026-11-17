import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { BuyerId, GameEvent, SessionStatus, StepAction } from '../../../shared/api';
import { ApiFailure } from './api';
import { audio } from './audio';
import { LiveDriver, type Driver, type LeniencyState, type SessionMeta, type StartOptions } from './driver';
import { getIdentity } from './identity/store';
import { PreviewDriver } from './preview';
import { recordSeason } from './seasons';
import { apply, initialView, type View } from './state';
import { currentFisherKey } from './wallet';

type Act = { type: 'events'; events: GameEvent[]; status: SessionStatus | null } | { type: 'reset' };

function reducer(v: View, a: Act): View {
  if (a.type === 'reset') return initialView;
  let n = v;
  for (const e of a.events) n = apply(n, e);
  return a.status ? { ...n, status: a.status } : n;
}

export type Pending = StepAction | 'start' | 'leniency' | null;

/** Pre-voiced lines keyed by exact text, so scripted lines use studio VO and live lines use TTS. */
const VO_BY_TEXT: Record<string, string> = {
  "Morning, captain. Let's keep this civilised.": 'marlow_greet',
  'Nobody on this pier talks. Nobody.': 'marlow_threat',
  'You rat. After everything I did for this harbour.': 'marlow_betrayed',
  'Your catch. Our price. Shall we.': 'odile_greet',
  "Mornin'. Look — it's nothin' personal, yeah?": 'sully_greet',
  'Darling, you look exhausted. Sell to me and go to bed.': 'ines_greet',
  'Peace be with you.': 'deacon_greet',
  'As agreed.': 'deacon_bid',
  'Judas.': 'deacon_betrayed',
};

function cue(e: GameEvent, driver: Driver, firstDay: { done: boolean }) {
  switch (e.type) {
    case 'day_opened':
      audio.sfx('auction_bell', 0.5);
      if (!firstDay.done) firstDay.done = true;
      else audio.say('day_open');
      return;
    case 'bid_committed':
      audio.sfx('paper_slide', 0.35);
      return;
    case 'bids_revealed':
      audio.sfx('card_flip', 0.6);
      if (e.identical) window.setTimeout(() => audio.say('identical'), 900);
      return;
    case 'lot_settled':
      audio.sfx('gavel', 0.7);
      return;
    case 'line': {
      const key = VO_BY_TEXT[e.text];
      if (key) audio.say(key);
      else {
        const url = driver.ttsUrl(e.seq);
        if (url) audio.sayUrl(url);
      }
      return;
    }
    case 'leniency_open':
      audio.playMusic('harbour_tense', 900);
      audio.say('leniency');
      return;
    case 'confession_attempt':
      if (e.ok) {
        audio.sting('confession_sting');
        audio.sfx('wax_seal', 0.8);
        audio.say('confessed');
      } else audio.sfx('refusal_thud', 0.9);
      return;
    case 'slashed':
      audio.sfx('bond_slash', 0.85);
      window.setTimeout(() => audio.sfx('coins_pour', 0.7), 1100);
      return;
    case 'holdout':
      audio.say('holdout');
      audio.playMusic('harbour_loop');
      return;
    default: {
      // brief-3 events: the interrogated buyer's answer and the narrator's day recap are voiced live.
      const t = (e as { type: string }).type;
      if (t === 'interrogation' || t === 'recap') {
        const url = driver.ttsUrl(e.seq);
        if (url) audio.sayUrl(url);
      }
    }
  }
}

export function useGame() {
  const preview = useMemo(() => new URLSearchParams(location.search).has('preview'), []);
  const driverRef = useRef<Driver | null>(null);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [view, dispatch] = useReducer(reducer, initialView);
  const [pending, setPending] = useState<Pending>(null);
  const [failure, setFailure] = useState<{ message: string; code: string; retry?: () => void } | null>(null);
  const firstDay = useRef({ done: false });
  // Resuming replays the whole season's history; only events after that history are voiced and cued.
  const replayTo = useRef(-1);
  const [leniencyState, setLeniencyState] = useState<LeniencyState>('idle');

  const run = useCallback(async (label: Pending, fn: () => Promise<unknown>, retry?: () => void) => {
    setPending(label);
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      const code = err instanceof ApiFailure ? err.code : 'CLIENT';
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setFailure({ message, code, retry });
    } finally {
      setPending(null);
    }
  }, []);

  /** `mode` defaults to the signed-in identity: a connected wallet plays as the wallet, anything else as a guest. */
  const start = useCallback((opts: StartOptions = {}) => {
    const mode = opts.resume ? (opts.resume.meta.playerKind ?? 'guest') : (opts.mode ?? (getIdentity().kind === 'wallet' ? 'wallet' : 'guest'));
    const resuming = !!opts.resume && !preview;
    const d: Driver = preview ? new PreviewDriver() : new LiveDriver({ ...opts, mode });
    setLeniencyState('idle');
    setMeta(null);
    driverRef.current = d;
    firstDay.current.done = resuming;
    replayTo.current = resuming ? Number.POSITIVE_INFINITY : -1;
    dispatch({ type: 'reset' });
    d.subscribe((events, status) => {
      if (driverRef.current !== d) return;
      if (replayTo.current === Number.POSITIVE_INFINITY && status) replayTo.current = status.lastSeq;
      dispatch({ type: 'events', events, status });
      for (const e of events) if (e.seq > replayTo.current) cue(e, d, firstDay.current);
    });
    // "Try again" after a failed setup resumes the same season: the session is opened once, and only `begin`
    // (which the server resumes, e.g. after a standard-mode restart outran the proxy) is sent again.
    let opened: SessionMeta | null = null;
    const go = () =>
      run('start', async () => {
        if (!opened) {
          opened = await d.start();
          setMeta(opened);
          if (resuming) return;
          if (d.kind === 'live') recordSeason(opened, opened.playerKind === 'wallet' ? null : currentFisherKey());
        } else if (resuming) return;
        await d.step('begin');
      }, go);
    void go();
  }, [preview, run]);

  const act = useCallback(
    (a: StepAction) => {
      const d = driverRef.current;
      if (!d) return;
      const go = () => run(a, () => d.step(a), go);
      void go();
    },
    [run],
  );

  const offerLeniency = useCallback(() => {
    const d = driverRef.current;
    const season = view.seasonId ?? view.status?.seasonId;
    if (!d || season == null) return;
    const go = () =>
      run(
        'leniency',
        async () => {
          setLeniencyState('submitted');
          try {
            await d.leniency(season, setLeniencyState);
          } catch (e) {
            setLeniencyState('failed');
            throw e;
          }
        },
        go,
      );
    void go();
  }, [run, view.seasonId, view.status?.seasonId]);

  const [interrogatedDay, setInterrogatedDay] = useState<number | null>(null);
  const [interroError, setInterroError] = useState<string | null>(null);
  const [interroPending, setInterroPending] = useState(false);
  const interrogate = useCallback(
    async (buyer: BuyerId, input: { audio?: Blob; text?: string }) => {
      const d = driverRef.current;
      if (!d) return;
      setInterroPending(true);
      setInterroError(null);
      try {
        await d.interrogate(buyer, input);
        setInterrogatedDay(view.lot?.day ?? null);
      } catch (err) {
        setInterroError(err instanceof Error ? err.message : 'They would not talk.');
      } finally {
        setInterroPending(false);
      }
    },
    [view.lot?.day],
  );

  const loadCasefile = useCallback(() => {
    const d = driverRef.current;
    if (!d) return Promise.reject(new Error('No session'));
    return d.casefile();
  }, []);

  // Music follows the story: tense under leniency, cue on the ending.
  useEffect(() => {
    if (!view.closed) return;
    audio.stopMusic(800);
    const won = !!view.slashed;
    window.setTimeout(() => {
      audio.sting(won ? 'victory' : 'defeat', 0.75);
      audio.say(won ? 'season_end_win' : 'season_end_lose');
    }, 2400);
  }, [view.closed, view.slashed]);

  const confessor: BuyerId | null = view.slashed?.confessor ?? null;
  return {
    preview,
    meta,
    view,
    pending,
    failure,
    start,
    act,
    offerLeniency,
    /** idle | awaiting-wallet | submitted | open | rejected | failed */
    leniencyState,
    loadCasefile,
    confessor,
    dismissFailure: () => setFailure(null),
    interrogate,
    interrogatedToday: interrogatedDay !== null && interrogatedDay === view.lot?.day,
    interroPending,
    interroError,
    clearInterroError: () => setInterroError(null),
    wiretapUrl: () => driverRef.current?.wiretapUrl() ?? null,
    forge: () => {
      const d = driverRef.current;
      return d ? d.forge() : Promise.reject(new Error('No session'));
    },
  };
}
