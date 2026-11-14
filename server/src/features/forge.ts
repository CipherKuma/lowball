// "Try to forge a confession": real testnet confessions the contract must refuse, with their real tx hashes.
//
// Why a drill season. The contract checks E_CLOSED / E_ALREADY_CONFESSED first and E_NO_LENIENCY before the pact
// and signature checks, so on the (closed) real season every forgery would only say "closed". The server therefore
// opens a throwaway one-day season (the same five buyers, a 0.001 NEAR bond, a throwaway player key it holds) and
// offers leniency itself, which is the one way to get a live window without the real player's browser key. Inside
// that window the contract's real signature checks run. Nothing here is simulated: every hash is a landed tx.
import { BUYER_IDS, BUYER_NAMES, type BuyerId, type ErrorCode, type ForgeAttempt, type ForgeKind, type ForgeResponse } from '../../../shared/api.js';
import type { PactJson, PactSigJson } from '../chain/types.js';
import { AppError } from '../errors.js';
import { GameCtx, type GameDeps } from '../game/ctx.js';
import { toB64 } from '../near/bytes.js';
import { formatPublicKey, generateKeyPair } from '../near/keys.js';
import { nearToYocto } from '../near/accounts.js';
import { signConfession } from '../near/pact.js';

const DRILL_BOND = nearToYocto('0.001');
const LOCK_MS = 150_000;

async function attempt(
  ctx: GameCtx,
  kind: ForgeKind,
  buyer: BuyerId,
  seasonId: number,
  pact: PactJson,
  sigs: PactSigJson[],
  note: string,
  payoutEvm = false,
): Promise<ForgeAttempt> {
  const acct = ctx.state.buyers.find((b) => b.id === buyer)!.accountId;
  // The confession signature is made by a key the contract has never seen: a freshly generated one.
  const forged = toB64(signConfession(seasonId, acct, BigInt(pact.nonce), generateKeyPair()));
  try {
    const r = await ctx.chain.confess(buyer, seasonId, pact, sigs, { confessionSig: forged, payoutEvm });
    await ctx.recordTx(`forge ${kind} ${buyer}`, acct, r);
    return { kind, buyer, seasonId, tx: r.hash, errorCode: r.errorCode, ok: r.ok, note: r.ok ? 'THE CONTRACT ACCEPTED THIS FORGERY' : note };
  } catch (e) {
    const code: ErrorCode = e instanceof AppError ? e.code : 'TX_FAILED';
    return { kind, buyer, seasonId, tx: '', errorCode: code, ok: false, note: 'This attempt could not be sent; no transaction exists.' };
  }
}

/** Build the drill season: five buyers, bonds posted, a lot open, leniency live (offered by the throwaway player). */
async function openDrill(ctx: GameCtx): Promise<number> {
  const { chain } = ctx;
  const s = ctx.state;
  const key = generateKeyPair();
  const player = await chain.createPlayer(formatPublicKey(key.publicKey));
  await ctx.recordTx('forge create_player', chain.houseId, player.tx);
  if (!player.tx.ok) throw new AppError(player.tx.errorCode ?? 'TX_FAILED', 'Could not create the drill player.');
  for (const b of s.buyers) {
    const fund = await chain.ensureBuyerFunds(b.id, b.accountId, DRILL_BOND);
    if (fund) await ctx.must(`forge fund ${b.id}`, chain.houseId, Promise.resolve(fund));
  }
  const season = await chain.createSeason(player.accountId, s.buyers.map((b) => b.accountId), 1, DRILL_BOND);
  await ctx.recordTx('forge create_season', chain.houseId, season);
  if (!season.ok || season.seasonId === undefined) throw new AppError(season.errorCode ?? 'TX_FAILED', 'Could not create the drill season.');
  const id = season.seasonId;
  await Promise.all(s.buyers.map((b) => ctx.must(`forge post_bond ${b.id}`, b.accountId, chain.postBond(b.id, id, DRILL_BOND))));
  await ctx.must('forge open_lot', chain.houseId, chain.openLot(id, 'forgery drill', 60, 1));
  const offered = await chain.offerLeniencyAs(player.accountId, key, id);
  await ctx.recordTx('forge offer_leniency', player.accountId, offered);
  if (!offered.ok) throw new AppError(offered.errorCode ?? 'TX_FAILED', 'Could not open the drill leniency window.');
  const live = await chain.verifyLeniencyTx(offered.hash, player.accountId, id);
  if (!live.ok) throw new AppError(live.errorCode ?? 'TX_FAILED', live.message ?? 'The drill leniency window did not open.');
  return id;
}

export function checkForgeable(s: { phase: string; forgery?: unknown; seasonId: number | null }): void {
  if (s.phase !== 'closed' || s.seasonId === null) throw new AppError('BAD_PHASE', 'The forgery drill opens with the Case File, once the season is closed.');
  if (s.forgery) throw new AppError('ALREADY_FORGED');
}

export async function forge(deps: GameDeps, id: string): Promise<ForgeResponse> {
  const { store } = deps;
  const first = await store.loadState(id);
  if (!first) throw new AppError('NOT_FOUND', 'No such session.');
  checkForgeable(first);
  if (!(await store.tryLock(id, LOCK_MS))) throw new AppError('BUSY');
  let ctx: GameCtx | null = null;
  let drill: number | null = null;
  try {
    const s = await store.loadState(id);
    if (!s) throw new AppError('NOT_FOUND', 'No such session.');
    checkForgeable(s);
    s.seq = Math.max(s.seq, await store.lastSeq(id));
    ctx = new GameCtx(id, s, deps);
    const realSeason = s.seasonId!;
    drill = await openDrill(ctx);
    const drillId: number = drill;

    const members = s.pact?.members ?? BUYER_IDS.slice(0, 2);
    const caller = members[0]!;
    const callerAcct = s.buyers.find((b) => b.id === caller)!.accountId;
    const other = s.buyers.find((b) => b.id !== caller)!.accountId;
    const nonce = BigInt(Math.floor(Math.random() * 2 ** 31) + 1).toString();
    const attempts: ForgeAttempt[] = [];
    const skipped: { kind: ForgeKind; reason: string }[] = [];

    // (a) forge: a buyer confesses with a confession signature from an unregistered key. No pact signatures are
    // attached: the contract checks the confession signature before it counts signatures, so it refuses on the forgery.
    const ownPact: PactJson = { season_id: drillId, cap: 50, members: [callerAcct, other], nonce };
    attempts.push(await attempt(ctx, 'forge', caller, drillId, ownPact, [], `${BUYER_NAMES[caller]} confesses, but the confession is signed by a key that is not the registered pact key.`));

    // (b) replay: this case's real pact and its real signatures, submitted into a different season.
    if (s.pact) {
      const pact: PactJson = { season_id: realSeason, cap: s.pact.cap, members: s.pact.memberAccounts, nonce: s.pact.nonce };
      const sigs: PactSigJson[] = s.pact.signatures.map((x) => ({ signer: x.signer, signature: x.signatureB64 }));
      attempts.push(await attempt(ctx, 'replay', caller, drillId, pact, sigs, 'The real pact and signatures, replayed into another season: they were signed for season ' + realSeason + '.'));
    } else {
      skipped.push({ kind: 'replay', reason: 'No pact was formed in this season, so there are no signatures to replay.' });
    }

    // (c) late: the real, closed season. The contract refuses any confession once the season is closed.
    const latePact: PactJson = s.pact
      ? { season_id: realSeason, cap: s.pact.cap, members: s.pact.memberAccounts, nonce: s.pact.nonce }
      : { season_id: realSeason, cap: 50, members: [callerAcct, other], nonce };
    const lateSigs: PactSigJson[] = s.pact ? s.pact.signatures.map((x) => ({ signer: x.signer, signature: x.signatureB64 })) : [];
    attempts.push(await attempt(ctx, 'late', caller, realSeason, latePact, lateSigs, 'A confession for the real season after it closed.', s.payoutEvm !== null));

    // tidy: close the drill season (refunds the 0.001 NEAR bonds). Best effort; its hash is reported when it lands.
    let cleanupTx: string | undefined;
    try {
      const c = await deps.chain.closeSeason(drillId);
      await ctx.recordTx('forge close_season', deps.chain.houseId, c);
      if (c.ok) cleanupTx = c.hash;
    } catch {
      /* the drill season simply stays open until it goes stale; nothing depends on it */
    }
    const drillSeasonId = drillId;
    drill = null;

    const body = { attempts, drillSeasonId, ...(cleanupTx ? { cleanupTx } : {}), ...(skipped.length ? { skipped } : {}) };
    s.forgery = body;
    const ev = await ctx.emit({ type: 'forgery', ...body });
    await ctx.save();
    return { ok: true, ...body, seq: ev.seq };
  } catch (e) {
    if (drill !== null && ctx) await deps.chain.closeSeason(drill).catch(() => undefined);
    throw e;
  } finally {
    await ctx?.flushReceipts().catch(() => undefined);
    await store.unlock(id);
  }
}
