import type {
  BuyerId,
  CasefileResponse,
  GameEvent,
  GameEventBody,
  SessionStatus,
  StepAction,
} from '../../../shared/api';
import { BUYER_IDS, BUYER_NAMES } from '../../../shared/api';
import type { Driver, SessionMeta } from './driver';

/**
 * PREVIEW ONLY. A scripted season for tapping through the UI before the testnet backend is live.
 * Every screen shows a "Preview — scripted" badge while this driver is active. Never used in the
 * live build (selected only by ?preview=1).
 */
const HOUSE = 'lowball-house-ck.testnet';
const fakeTx = () =>
  Array.from({ length: 44 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 58)]).join('');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LOTS = [
  { species: 'Atlantic cod', weightKg: 42, fairValue: 40 },
  { species: 'Halibut', weightKg: 31, fairValue: 55 },
  { species: 'Monkfish', weightKg: 18, fairValue: 36 },
  { species: 'Bluefin tuna', weightKg: 96, fairValue: 120 },
  { species: 'Sea bass', weightKg: 22, fairValue: 44 },
  { species: 'Lobster', weightKg: 12, fairValue: 70 },
];
const CAP_RATIO = 0.3;

const GREET: Record<BuyerId, string> = {
  marlow: "Morning, captain. Let's keep this civilised.",
  odile: 'Your catch. Our price. Shall we.',
  sully: "Mornin'. Look — it's nothin' personal, yeah?",
  ines: 'Darling, you look exhausted. Sell to me and go to bed.',
  deacon: 'Peace be with you.',
};
const HOLD: Record<BuyerId, string> = {
  marlow: 'Hold it all you like. Fish don’t keep.',
  odile: 'Every hour on ice costs you, not us.',
  sully: 'Same number, captain. I — we all said the same number.',
  ines: 'Stubborn. I like that. The price is still the price.',
  deacon: 'As agreed.',
};

export class PreviewDriver implements Driver {
  readonly kind = 'preview' as const;
  private seq = 0;
  private day = 0;
  private holds = 0;
  private listeners = new Set<(e: GameEvent[], s: SessionStatus | null) => void>();
  private phase: SessionStatus['phase'] = 'created';
  private confessed = false;

  private status(): SessionStatus {
    return {
      phase: this.phase,
      busy: false,
      day: this.day,
      days: LOTS.length,
      seasonId: 7,
      leniencyAvailable: (this.phase === 'lot_open' || this.phase === 'settled') && !this.confessed,
      confessed: this.confessed,
      lastSeq: this.seq,
    };
  }

  private async emit(body: GameEventBody, gap = 260) {
    await wait(gap);
    const e = { ...body, seq: ++this.seq, ts: Date.now() } as GameEvent;
    this.listeners.forEach((l) => l([e], this.status()));
  }

  async start(): Promise<SessionMeta> {
    await wait(500);
    return {
      sessionId: 'preview',
      playerAccountId: `p7k2qx.${HOUSE}`,
      contractId: 'lowball-ck.testnet',
      buyers: BUYER_IDS.map((id) => ({ id, name: BUYER_NAMES[id], accountId: `${id}.${HOUSE}` })),
      days: LOTS.length,
      bondYocto: (2n * 10n ** 23n).toString(),
    };
  }

  private async openDay() {
    this.day += 1;
    this.holds = 0;
    const lot = LOTS[this.day - 1];
    await this.emit({ type: 'day_opened', day: this.day, ...lot, tx: fakeTx() }, 700);
    await this.emit({ type: 'lot_minted', tokenId: `s7-d${this.day}`, amount: lot.weightKg, tx: fakeTx() }, 400);
    for (const b of BUYER_IDS) await this.emit({ type: 'bid_committed', buyer: b, tx: fakeTx() }, 380);
    this.phase = 'lot_open';
    await this.emit({ type: 'rumour', text: 'Five sealed envelopes on the zinc.' }, 200);
  }

  async step(action: StepAction): Promise<void> {
    if (action === 'begin') {
      await this.emit({ type: 'account_created', accountId: `p7k2qx.${HOUSE}`, tx: fakeTx() }, 900);
      await this.emit({ type: 'season_created', seasonId: 7, tx: fakeTx() }, 800);
      for (const b of BUYER_IDS) await this.emit({ type: 'bond_posted', buyer: b, tx: fakeTx() }, 520);
      await this.emit({ type: 'cartel_forming' }, 600);
      await this.emit({ type: 'rumour', text: 'Somebody saw the five of them at the Anchor last night. Late.' }, 2600);
      for (const b of BUYER_IDS) await this.emit({ type: 'line', buyer: b, text: GREET[b], mood: 'calm' }, 900);
      await this.openDay();
      return;
    }
    if (action === 'sell') {
      const lot = LOTS[this.day - 1];
      const cap = Math.round(lot.fairValue * CAP_RATIO);
      const reveals = BUYER_IDS.map((buyer) => ({ buyer, amount: cap, tx: fakeTx() }));
      await this.emit({ type: 'bids_revealed', reveals, identical: true }, 900);
      await this.emit(
        { type: 'lot_settled', winner: 'marlow', price: cap, shortfall: lot.fairValue - cap, tx: fakeTx() },
        1200,
      );
      await this.emit(
        { type: 'lot_transferred', tokenId: `s7-d${this.day}`, to: `marlow.${HOUSE}`, buyer: 'marlow', tx: fakeTx() },
        500,
      );
      await this.emit({ type: 'line', buyer: 'marlow', text: 'Pleasure doing business.', mood: 'calm' }, 700);
      this.phase = 'settled';
      return;
    }
    if (action === 'hold') {
      this.holds += 1;
      const who = BUYER_IDS[(this.day + this.holds) % 5];
      const other = BUYER_IDS[(this.day + this.holds + 2) % 5];
      await this.emit({ type: 'line', buyer: who, text: HOLD[who], mood: 'cold' }, 600);
      await this.emit({ type: 'line', buyer: other, text: HOLD[other], mood: 'tense' }, 1400);
      for (const b of BUYER_IDS) await this.emit({ type: 'bid_committed', buyer: b, tx: fakeTx() }, 300);
      return;
    }
    if (action === 'next_day') {
      if (this.day >= LOTS.length) {
        this.phase = 'closed';
        await this.emit({ type: 'season_closed', tx: fakeTx() }, 900);
        return;
      }
      await this.openDay();
    }
  }

  async leniency(): Promise<BuyerId | null> {
    await wait(1400); // signing in the browser
    await this.emit({ type: 'leniency_open', tx: fakeTx() }, 200);
    for (const b of BUYER_IDS) await this.emit({ type: 'deliberating', buyer: b }, 240);
    await this.emit({ type: 'line', buyer: 'marlow', text: 'Nobody on this pier talks. Nobody.', mood: 'cold' }, 2200);
    await this.emit({ type: 'line', buyer: 'odile', text: 'Run the numbers, Marlow. Then threaten.', mood: 'tense' }, 2400);
    await this.emit({ type: 'line', buyer: 'sully', text: 'Okay. Okay! I’ll tell you everything.', mood: 'cracking' }, 2600);
    await this.emit({ type: 'confession_attempt', buyer: 'sully', ok: true, tx: fakeTx() }, 900);
    await this.emit({ type: 'confession_attempt', buyer: 'ines', ok: false, errorCode: 'E_ALREADY_CONFESSED', tx: fakeTx() }, 700);
    const slashed = (['marlow', 'odile', 'ines', 'deacon'] as BuyerId[]).map((buyer) => ({
      buyer,
      yocto: (2n * 10n ** 23n).toString(),
    }));
    await this.emit({ type: 'slashed', confessor: 'sully', slashed, payoutYocto: (8n * 10n ** 23n).toString(), tx: fakeTx() }, 900);
    await this.emit({ type: 'line', buyer: 'marlow', text: 'You rat. After everything I did for this harbour.', mood: 'cold' }, 1800);
    await this.emit({ type: 'line', buyer: 'deacon', text: 'Judas.', mood: 'cold' }, 1600);
    this.confessed = true;
    this.phase = 'closed';
    await this.emit({ type: 'season_closed', tx: fakeTx() }, 900);
    return 'sully';
  }

  async casefile(): Promise<CasefileResponse> {
    const { previewCasefile } = await import('./previewCasefile');
    return previewCasefile(this.status());
  }

  ttsUrl() {
    return null;
  }

  subscribe(fn: (e: GameEvent[], s: SessionStatus | null) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
