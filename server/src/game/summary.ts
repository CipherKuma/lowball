// Read-only season summary: the public session record behind "my seasons".
import type { GameEvent, SeasonSummary } from '../../../shared/api.js';
import type { Store } from '../store/types.js';
import type { SessionState } from './state.js';

/** The slashed sum is only recorded in the `slashed` event (state keeps just `confessed`/`confessor`). */
async function slashedPayout(store: Store, id: string): Promise<string | null> {
  let after = 0;
  for (;;) {
    const page: GameEvent[] = await store.listEvents(id, after, 200);
    for (const e of page) if (e.type === 'slashed') return e.payoutYocto;
    if (page.length < 200) return null;
    after = page[page.length - 1]!.seq;
  }
}

export function summaryOf(id: string, s: SessionState, createdAt: number, payoutYocto: string | null): SeasonSummary {
  return {
    sessionId: id,
    playerAccountId: s.playerAccountId,
    playerKind: s.playerKind ?? 'guest',
    contractId: s.contractId,
    buyers: s.buyers,
    days: s.days,
    bondYocto: s.bondYocto,
    payoutEvm: s.payoutEvm ?? null,
    seasonId: s.seasonId,
    phase: s.phase,
    day: s.day,
    closed: s.phase === 'closed',
    failed: s.phase === 'failed',
    confessor: s.confessor,
    payoutYocto,
    createdAt,
  };
}

/** Amount paid to the player: the `slashed` event's payoutYocto after a confession, '0' for a season closed with nobody confessing, else null. */
export async function payoutOf(store: Store, id: string, s: SessionState): Promise<string | null> {
  if (s.confessed) return slashedPayout(store, id);
  return s.phase === 'closed' ? '0' : null;
}

export async function buildSummary(store: Store, id: string): Promise<SeasonSummary | null> {
  const row = await store.getSessionRow(id);
  if (!row) return null;
  return summaryOf(id, row.state, row.createdAt, await payoutOf(store, id, row.state));
}

/** Latest wallet seasons of one account, newest first. */
export async function listSeasons(store: Store, accountId: string, limit = 20): Promise<SeasonSummary[]> {
  const rows = await store.listSessionsByPlayer(accountId, limit * 3);
  const mine = rows.filter((r) => r.state.playerKind === 'wallet' && r.state.playerAccountId === accountId).slice(0, limit);
  return Promise.all(mine.map(async (r) => summaryOf(r.id, r.state, r.createdAt, await payoutOf(store, r.id, r.state))));
}
