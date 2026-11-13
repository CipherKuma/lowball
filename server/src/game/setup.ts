import { BUYER_IDS, type BuyerId, type ChannelMessage } from '../../../shared/api.js';
import { AppError } from '../errors.js';
import { CartelOut, JSON_SCHEMAS } from '../llm/schemas.js';
import { randomNonce, signPact, verifyPactSig, type Pact } from '../near/pact.js';
import { toB64 } from '../near/bytes.js';
import { pickRumour } from './cast.js';
import type { GameCtx } from './ctx.js';
import { openNextLot } from './days.js';
import { cartelPrompt, system } from './prompts.js';

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
async function formCartel(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  if (s.seasonId === null) throw new AppError('BAD_PHASE');
  await ctx.emit({ type: 'cartel_forming' });
  const r1 = await cartelRound(ctx, 1);
  s.channel.push(...r1);
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
}

/** begin: treasury check, season, bonds, private cartel talk, first lot. Resumable after a failure. */
export async function beginSeason(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  const { chain, config } = ctx.deps;
  if (s.phase !== 'created') throw new AppError('BAD_PHASE', 'The season has already begun.');
  const buyerAccounts = s.buyers.map((b) => b.accountId);

  if (s.seasonId === null) {
    const bal = await chain.houseBalance();
    if (bal < config.minTreasuryYocto) throw new AppError('TREASURY_LOW');
    for (const b of s.buyers) {
      const r = await chain.ensureBuyerFunds(b.id, b.accountId, config.bondYocto);
      if (r) await ctx.must(`fund ${b.id}`, chain.houseId, Promise.resolve(r));
    }
    const res = await chain.createSeason(s.playerAccountId, buyerAccounts, s.days, config.bondYocto);
    await ctx.recordTx('create_season', chain.houseId, res);
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

  if (!s.setup.cartelDone) await formCartel(ctx);
  await openNextLot(ctx);
}
