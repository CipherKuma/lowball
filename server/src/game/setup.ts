import { BUYER_IDS, type BuyerId, type ChannelMessage } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { CartelOut, JSON_SCHEMAS } from '../llm/schemas.js';
import { randomNonce, signPact, verifyPactSig, type Pact } from '../near/pact.js';
import { toB64 } from '../near/bytes.js';
import { pickRumour } from './cast.js';
import type { GameCtx } from './ctx.js';
import { openNextLot } from './days.js';
import { cartelPrompt, system } from './prompts.js';
import { enclaveBlockedPact, teeRoundTwo } from '../tee/cartel.js';
import { chooseMode, ensureKeys, teeFor, withModeLock } from '../tee/mode.js';
import { ensureSea } from '../features/sea.js';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

async function cartelRound(ctx: GameCtx, round: 1 | 2): Promise<ChannelMessage[]> {
  const s = ctx.state;
  const prior = s.channel.filter((m) => m.round === 1);
  const results = await Promise.allSettled(
    BUYER_IDS.map(async (id) => {
      const own = prior.find((m) => m.buyer === id) ?? null;
      const r = await ctx.deps.llm.complete({
        buyer: id,
        kind: 'cartel',
        day: null,
        system: system(id, s),
        user: cartelPrompt(id, s, round, own),
        schema: CartelOut,
        jsonSchema: JSON_SCHEMAS.cartel,
        schemaName: 'cartel_talk',
      });
      ctx.track(r.receipt);
      const msg: ChannelMessage = {
        round,
        buyer: id,
        say: r.value.say,
        proposeCap: r.value.propose_cap,
        sign: r.value.sign,
        mood: r.value.mood as ChannelMessage['mood'],
        chatId: r.chatId,
      };
      return msg;
    }),
  );
  const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) throw failed.reason instanceof AppError ? failed.reason : new AppError('MODEL_UNAVAILABLE');
  return (results as PromiseFulfilledResult<ChannelMessage>[]).map((r) => r.value);
}

/** Two rounds of private talk, then the signers (if at least two) sign one pact. */
async function formCartel(ctx: GameCtx): Promise<'done' | 'restart'> {
  const s = ctx.state;
  if (s.seasonId === null) throw new AppError('BAD_PHASE');
  await ctx.emit({ type: 'cartel_forming' });
  const tee = teeFor(ctx);
  // a retry after a failed enclave job keeps the round-1 talk it already has
  const kept = tee ? s.channel.filter((m) => m.round === 1) : [];
  const r1 = kept.length === BUYER_IDS.length ? kept : await cartelRound(ctx, 1);
  if (kept.length !== BUYER_IDS.length) {
    s.channel = s.channel.filter((m) => m.round !== 1 && m.round !== 2);
    s.channel.push(...r1);
  }
  if (tee) {
    // TEE_BUYERS=1: round 2 is five enclave jobs; they decide sign yes/no and sign the pact themselves.
    s.channel = s.channel.filter((m) => m.round !== 2);
    const two = await teeRoundTwo(ctx, tee, r1);
    s.channel.push(...two.msgs);
    // The enclaves, not the buyers, stopped the cartel: do not run a plain auction, restart in standard mode (once).
    if (!s.fallback && enclaveBlockedPact(two)) return 'restart';
    await ctx.emit({ type: 'rumour', text: pickRumour(s.seed) });
    s.setup.cartelDone = true;
    await ctx.save();
    return 'done';
  }
  const r2 = await cartelRound(ctx, 2);
  s.channel.push(...r2);
  const signers = r2.filter((m) => m.sign);
  if (signers.length >= 2) {
    const members = BUYER_IDS.filter((id) => signers.some((m) => m.buyer === id));
    const accounts = members.map((id) => s.buyers.find((b) => b.id === id)!.accountId);
    const pact: Pact = {
      seasonId: s.seasonId,
      cap: median(signers.map((m) => m.proposeCap)),
      members: accounts,
      nonce: randomNonce(),
    };
    const sigs = members.map((id, i) => {
      const key = ctx.deps.pactKeys[id];
      const sig = signPact(pact, key);
      if (!verifyPactSig(pact, sig, key.publicKey)) throw new AppError('INTERNAL', 'pact signature self-check failed');
      return { buyer: id, signer: accounts[i]!, signatureB64: toB64(sig) };
    });
    s.pact = {
      cap: pact.cap,
      members,
      memberAccounts: accounts,
      nonce: pact.nonce.toString(),
      signatures: sigs,
    };
  }
  // Public flavour, emitted whether or not a pact formed: it must not reveal the outcome.
  await ctx.emit({ type: 'rumour', text: pickRumour(s.seed) });
  s.setup.cartelDone = true;
  await ctx.save();
  return 'done';
}

/**
 * The enclaves failed the cartel's pact (not the buyers' choice): forget the enclave season and set the session up
 * again in standard mode. State is reset and saved first, so a request cut short here resumes through beginSeason.
 */
async function restartStandard(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  s.fallback = { fromSeasonId: s.seasonId!, at: (ctx.deps.now ?? Date.now)(), closed: false };
  s.mode = 'standard';
  s.seasonId = null;
  s.pact = null;
  s.channel = [];
  s.setup = { bondsDone: [], cartelDone: false };
  await ctx.emit({ type: 'line', buyer: 'marlow', text: 'The enclaves did not answer. The harbour restarts the season in standard mode.', mood: 'calm', note: true });
  await ctx.emit({ type: 'mode', mode: 'standard', reason: 'The buyers\' enclaves did not sign the pact, so the harbour restarted the season in standard mode.' });
  await ctx.save();
}

/** close the abandoned enclave season (house may close any time; posted bonds are refunded to the buyers) */
async function closeAbandoned(ctx: GameCtx): Promise<void> {
  const f = ctx.state.fallback;
  if (!f || f.closed) return;
  const r = await ctx.chain.closeSeason(f.fromSeasonId);
  await ctx.recordTx('close_season (enclave restart)', ctx.chain.houseId, r);
  if (!r.ok && r.errorCode !== 'E_CLOSED') throw new AppError(r.errorCode ?? 'TX_FAILED', 'could not close the enclave season');
  f.closed = true;
  await ctx.save();
}

/** begin: treasury check, season, bonds, private cartel talk, first lot. Resumable after a failure. */
export async function beginSeason(ctx: GameCtx): Promise<void> {
  if (ctx.state.phase !== 'created') throw new AppError('BAD_PHASE', 'The season has already begun.');
  if ((await setupSeason(ctx)) === 'restart') {
    await restartStandard(ctx);
    await setupSeason(ctx);
  }
  await ensureSea(ctx);
  await openNextLot(ctx);
}

/** season, bonds and the cartel; 'restart' when the enclaves blocked the pact (see restartStandard) */
async function setupSeason(ctx: GameCtx): Promise<'done' | 'restart'> {
  const s = ctx.state;
  const { chain, config } = ctx.deps;
  await closeAbandoned(ctx);
  const buyerAccounts = s.buyers.map((b) => b.accountId);

  if (s.seasonId === null) {
    const bal = await chain.houseBalance();
    if (bal < config.minTreasuryYocto) throw new AppError('TREASURY_LOW');
    for (const b of s.buyers) {
      const r = await chain.ensureBuyerFunds(b.id, b.accountId, config.bondYocto);
      if (r) await ctx.must(`fund ${b.id}`, chain.houseId, Promise.resolve(r));
    }
    // Mode, then keys, then create_season, all under one cross-session lock: the contract snapshots each buyer's
    // registered key at create_season, so a concurrent session must not re-register keys in between.
    const res = await withModeLock(ctx, async () => {
      if (!s.mode) {
        const c = await chooseMode(ctx);
        s.mode = c.mode;
        await ctx.emit({ type: 'mode', mode: c.mode, reason: c.reason });
        await ctx.save();
      }
      await ensureKeys(ctx, s.mode);
      const r = await chain.createSeason(s.playerAccountId, buyerAccounts, s.days, config.bondYocto, s.payoutEvm ?? undefined);
      await ctx.recordTx('create_season', chain.houseId, r);
      return r;
    });
    if (!res.ok || res.seasonId === undefined) throw new AppError(res.errorCode ?? 'TX_FAILED', 'create_season failed');
    s.seasonId = res.seasonId;
    s.setup.seasonTx = res.hash;
    await ctx.emit({ type: 'season_created', seasonId: res.seasonId, tx: res.hash });
    await ctx.save();
  }

  const todo = BUYER_IDS.filter((id) => !s.setup.bondsDone.includes(id));
  const bonds = await Promise.allSettled(
    todo.map(async (id: BuyerId) => {
      const b = s.buyers.find((x) => x.id === id)!;
      const tx = await ctx.must(`post_bond ${id}`, b.accountId, chain.postBond(id, s.seasonId!, config.bondYocto));
      s.setup.bondsDone.push(id);
      await ctx.emit({ type: 'bond_posted', buyer: id, tx });
    }),
  );
  await ctx.save();
  const bad = bonds.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (bad) throw bad.reason;

  return s.setup.cartelDone ? 'done' : formCartel(ctx);
}
