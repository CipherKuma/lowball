import type {
  BidReveal,
  BuyerId,
  ErrorCode,
  GameEvent,
  Mood,
  SessionStatus,
  SlashedBuyer,
} from '../../../shared/api';

export interface Lot {
  day: number;
  species: string;
  weightKg: number;
  fairValue: number;
  tx: string;
}
export interface DayRecord {
  day: number;
  species: string;
  fairValue: number;
  price: number;
  winner: BuyerId | null;
  identical: boolean;
  shortfall: number;
}
export interface Line {
  seq: number;
  buyer: BuyerId;
  text: string;
  mood: Mood;
}
export interface Attempt {
  seq: number;
  buyer: BuyerId;
  ok: boolean;
  errorCode?: ErrorCode;
  tx: string;
}
export interface TxItem {
  seq: number;
  label: string;
  tx: string;
}

export interface View {
  lastSeq: number;
  playerAccountId: string | null;
  seasonId: number | null;
  bonds: Partial<Record<BuyerId, string>>;
  cartelForming: boolean;
  rumours: string[];
  lot: Lot | null;
  committed: Partial<Record<BuyerId, string>>;
  reveals: BidReveal[] | null;
  identical: boolean;
  settled: { winner: BuyerId | null; price: number; shortfall: number; tx: string } | null;
  history: DayRecord[];
  shortfallTotal: number;
  identicalStreak: number;
  lines: Line[];
  leniencyOpen: boolean;
  deliberating: BuyerId[];
  attempts: Attempt[];
  slashed: { confessor: BuyerId; slashed: SlashedBuyer[]; payoutYocto: string; tx: string } | null;
  holdout: boolean;
  closed: boolean;
  /** NEP-245 token for today's lot, and who holds it */
  token: { id: string; amount: number; mintTx: string; owner: string | null; ownerBuyer: BuyerId | null; transferTx: string | null } | null;
  deadlineBlock: number | null;
  holdoutReason: 'timeout' | 'no_pact' | null;
  payoutEvm: { to: string; amountWei: string; sepoliaTx: string; nearTx: string; status?: string } | null;
  error:{ code: ErrorCode; message: string; retryable: boolean; seq: number } | null;
  txs: TxItem[];
  status: SessionStatus | null;
}

export const initialView: View = {
  lastSeq: 0,
  playerAccountId: null,
  seasonId: null,
  bonds: {},
  cartelForming: false,
  rumours: [],
  lot: null,
  committed: {},
  reveals: null,
  identical: false,
  settled: null,
  history: [],
  shortfallTotal: 0,
  identicalStreak: 0,
  lines: [],
  leniencyOpen: false,
  deliberating: [],
  attempts: [],
  slashed: null,
  holdout: false,
  closed: false,
  token: null,
  deadlineBlock: null,
  holdoutReason: null,
  payoutEvm: null,
  error: null,
  txs: [],
  status: null,
};

const tx = (v: View, seq: number, label: string, hash: string): TxItem[] =>
  hash ? [...v.txs, { seq, label, tx: hash }].slice(-40) : v.txs;

/** Fold one server event into the view. Pure; events are applied in seq order exactly once. */
export function apply(v: View, e: GameEvent): View {
  if (e.seq <= v.lastSeq) return v;
  const n: View = { ...v, lastSeq: e.seq };
  switch (e.type) {
    case 'account_created':
      return { ...n, playerAccountId: e.accountId, txs: tx(v, e.seq, 'Fisher account opened', e.tx) };
    case 'season_created':
      return { ...n, seasonId: e.seasonId, txs: tx(v, e.seq, `Season #${e.seasonId} created`, e.tx) };
    case 'bond_posted':
      return { ...n, bonds: { ...v.bonds, [e.buyer]: e.tx }, txs: tx(v, e.seq, `${e.buyer} posted bond`, e.tx) };
    case 'cartel_forming':
      return { ...n, cartelForming: true };
    case 'rumour':
      return { ...n, rumours: [...v.rumours, e.text].slice(-6) };
    case 'day_opened':
      return {
        ...n,
        cartelForming: false,
        lot: { day: e.day, species: e.species, weightKg: e.weightKg, fairValue: e.fairValue, tx: e.tx },
        committed: {},
        reveals: null,
        identical: false,
        settled: null,
        leniencyOpen: false,
        token: null,
        txs: tx(v, e.seq, `Day ${e.day}: lot opened`, e.tx),
      };
    case 'lot_minted':
      return {
        ...n,
        token: { id: e.tokenId, amount: e.amount, mintTx: e.tx, owner: null, ownerBuyer: null, transferTx: null },
        txs: tx(v, e.seq, `Catch minted as token ${e.tokenId}`, e.tx),
      };
    case 'lot_transferred':
      return {
        ...n,
        token: v.token && v.token.id === e.tokenId ? { ...v.token, owner: e.to, ownerBuyer: e.buyer ?? null, transferTx: e.tx } : v.token,
        txs: tx(v, e.seq, `Token ${e.tokenId} sent to ${e.buyer ?? e.to}`, e.tx),
      };
    case 'payout_evm':
      return {
        ...n,
        payoutEvm: { to: e.to, amountWei: e.amountWei, sepoliaTx: e.sepoliaTx, nearTx: e.nearTx, status: e.status },
      };
    case 'bid_committed':
      return {
        ...n,
        reveals: null,
        settled: null,
        committed: { ...v.committed, [e.buyer]: e.tx },
        txs: tx(v, e.seq, `${e.buyer} sealed a bid`, e.tx),
      };
    case 'bids_revealed':
      return { ...n, reveals: e.reveals, identical: e.identical };
    case 'lot_settled': {
      const lot = v.lot;
      const rec: DayRecord | null = lot
        ? {
            day: lot.day,
            species: lot.species,
            fairValue: lot.fairValue,
            price: e.price,
            winner: e.winner,
            identical: v.identical,
            shortfall: e.shortfall,
          }
        : null;
      return {
        ...n,
        settled: { winner: e.winner, price: e.price, shortfall: e.shortfall, tx: e.tx },
        history: rec ? [...v.history.filter((h) => h.day !== rec.day), rec] : v.history,
        shortfallTotal: v.shortfallTotal + e.shortfall,
        identicalStreak: v.identical ? v.identicalStreak + 1 : 0,
        txs: tx(v, e.seq, `Lot settled at ${e.price} marks`, e.tx),
      };
    }
    case 'line':
      return { ...n, lines: [...v.lines, { seq: e.seq, buyer: e.buyer, text: e.text, mood: e.mood }].slice(-30) };
    case 'leniency_open':
      return {
        ...n,
        leniencyOpen: true,
        holdout: false,
        deadlineBlock: e.deadlineBlock ?? null,
        txs: tx(v, e.seq, 'You offered leniency', e.tx),
      };
    case 'deliberating':
      return { ...n, deliberating: [...new Set([...v.deliberating, e.buyer])] };
    case 'confession_attempt':
      return {
        ...n,
        deliberating: v.deliberating.filter((b) => b !== e.buyer),
        attempts: [...v.attempts, { seq: e.seq, buyer: e.buyer, ok: e.ok, errorCode: e.errorCode, tx: e.tx }],
        txs: tx(v, e.seq, `${e.buyer} ${e.ok ? 'confessed' : 'refused: ' + (e.errorCode ?? '')}`, e.tx),
      };
    case 'slashed':
      return {
        ...n,
        deliberating: [],
        slashed: { confessor: e.confessor, slashed: e.slashed, payoutYocto: e.payoutYocto, tx: e.tx },
        txs: tx(v, e.seq, 'Bonds slashed, paid to you', e.tx),
      };
    case 'holdout':
      return { ...n, deliberating: [], holdout: true, leniencyOpen: false, holdoutReason: e.reason ?? null };
    case 'season_closed':
      return { ...n, closed: true, txs: tx(v, e.seq, 'Season closed', e.tx) };
    case 'error':
      return { ...n, error: { code: e.code, message: e.message, retryable: e.retryable, seq: e.seq } };
    default:
      return n;
  }
}

export function lastLineOf(v: View, buyer: BuyerId): Line | undefined {
  for (let i = v.lines.length - 1; i >= 0; i--) if (v.lines[i].buyer === buyer) return v.lines[i];
  return undefined;
}
