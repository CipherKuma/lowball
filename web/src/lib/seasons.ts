// The player's own seasons: a small book in this browser (every season it starts), plus, for a signed-in wallet,
// the server's list for that account, so a wallet's seasons follow it to a new browser.
import { useCallback, useEffect, useState } from 'react';
import type { SeasonSummary } from '../../../shared/api';
import { api } from './api';
import type { SessionMeta } from './driver';
import { readSession } from './identity/store';
import type { FisherKey } from './wallet';

const BOOK = 'lowball.seasons.v1';
const KEEP = 20;

export interface SeasonRecord {
  sessionId: string;
  mode: 'guest' | 'wallet';
  accountId: string;
  startedAt: number;
  /** guest seasons: the throwaway key that signs offer_leniency, so the season can be resumed after a reload */
  fisherKey?: FisherKey;
}

function readBook(): SeasonRecord[] {
  try {
    const raw = localStorage.getItem(BOOK);
    const list = raw ? (JSON.parse(raw) as SeasonRecord[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.sessionId === 'string') : [];
  } catch {
    return [];
  }
}

function writeBook(list: SeasonRecord[]) {
  try {
    localStorage.setItem(BOOK, JSON.stringify(list.slice(0, KEEP)));
  } catch {
    /* private mode: this browser keeps no book; wallet seasons still list from the server */
  }
}

export function recordSeason(meta: SessionMeta, fisherKey?: FisherKey | null) {
  const rest = readBook().filter((r) => r.sessionId !== meta.sessionId);
  const rec: SeasonRecord = {
    sessionId: meta.sessionId,
    mode: meta.playerKind ?? 'guest',
    accountId: meta.playerAccountId,
    startedAt: Date.now(),
    ...(fisherKey ? { fisherKey } : {}),
  };
  writeBook([rec, ...rest]);
}

export function recordFor(sessionId: string): SeasonRecord | null {
  return readBook().find((r) => r.sessionId === sessionId) ?? null;
}

export function metaOf(s: SeasonSummary): SessionMeta {
  return {
    sessionId: s.sessionId,
    playerAccountId: s.playerAccountId,
    playerKind: s.playerKind,
    contractId: s.contractId,
    buyers: s.buyers,
    days: s.days,
    bondYocto: s.bondYocto,
  };
}

export interface SeasonsState {
  status: 'loading' | 'ready' | 'error';
  seasons: SeasonSummary[];
  /** the newest season still in play, if any */
  open: SeasonSummary | null;
  reload: () => void;
}

/** Loads the player's seasons: this browser's book, merged with the signed-in wallet's list. */
export function useSeasons(walletAccount: string | null): SeasonsState {
  const [state, setState] = useState<Omit<SeasonsState, 'reload'>>({ status: 'loading', seasons: [], open: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    (async () => {
      const book = readBook();
      const byId = new Map<string, SeasonSummary>();
      let failed = 0;
      const token = walletAccount ? readSession() : null;
      if (token && token.accountId === walletAccount && token.expiresAt > Date.now()) {
        try {
          const r = await api.mySeasons(token.token);
          r.seasons.forEach((s) => byId.set(s.sessionId, s));
        } catch {
          failed++;
        }
      }
      const missing = book.filter((r) => !byId.has(r.sessionId)).slice(0, 10);
      const got = await Promise.allSettled(missing.map((r) => api.summary(r.sessionId)));
      got.forEach((g) => {
        if (g.status === 'fulfilled') byId.set(g.value.sessionId, g.value);
        else failed++;
      });
      if (!live) return;
      const seasons = [...byId.values()]
        .filter((s) => !s.failed && (s.seasonId != null || !s.closed))
        .sort((a, b) => b.createdAt - a.createdAt);
      // A season can be picked up again only where its signer lives: the wallet that played it, or this browser's key.
      const open =
        seasons.find(
          (s) =>
            !s.closed &&
            (s.playerKind === 'wallet' ? s.playerAccountId === walletAccount : !!recordFor(s.sessionId)?.fisherKey),
        ) ?? null;
      setState({ status: failed && !seasons.length ? 'error' : 'ready', seasons, open });
    })();
    return () => {
      live = false;
    };
  }, [walletAccount, tick]);

  return { ...state, reload };
}
