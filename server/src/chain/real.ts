import { AppError } from '../errors.js';
import { BUYER_IDS, type BuyerId } from '../../../shared/api.js';
import { NearSigner, parseOutcome, type TxResult } from '../near/signer.js';
import { Rpc, RpcError } from '../near/rpc.js';
import { randomPlayerAccount, nearToYocto, type BuyerKeys } from '../near/accounts.js';
import { parseSecretKey, type KeyPair } from '../near/keys.js';
import { toB64, utf8 } from '../near/bytes.js';
import type { Action } from '../near/tx.js';
import type { Chain, LeniencyCheck, PactJson, PactSigJson, SeasonView } from './types.js';

const TGAS = 10n ** 12n;
const GAS_DEFAULT = 100n * TGAS;
const GAS_CONFESS = 250n * TGAS;
const PLAYER_FUNDING = nearToYocto('0.05');
const PLAYER_ALLOWANCE = nearToYocto('0.04');
const STORAGE_PRICE = 10n ** 19n;

export interface RealChainOptions {
  rpc: Rpc;
  contractId: string;
  houseId: string;
  houseKey: string;
  buyerKeys: Record<BuyerId, BuyerKeys>;
}

function jsonArgs(o: unknown): Uint8Array {
  return utf8(JSON.stringify(o));
}

export class RealChain implements Chain {
  readonly contractId: string;
  readonly houseId: string;
  private rpc: Rpc;
  private house: NearSigner;
  private buyers = {} as Record<BuyerId, NearSigner>;
  private buyerAccounts = {} as Record<BuyerId, string>;

  constructor(o: RealChainOptions) {
    this.rpc = o.rpc;
    this.contractId = o.contractId;
    this.houseId = o.houseId;
    const hk: KeyPair = parseSecretKey(o.houseKey);
    this.house = new NearSigner({ accountId: o.houseId, keyPair: hk, rpc: o.rpc });
    for (const id of BUYER_IDS) {
      const accountId = `${id}.${o.houseId}`;
      this.buyerAccounts[id] = accountId;
      this.buyers[id] = new NearSigner({ accountId, keyPair: o.buyerKeys[id].near, rpc: o.rpc });
    }
  }

  private fn(method: string, args: unknown, deposit = 0n, gas = GAS_DEFAULT): Action {
    return { kind: 'functionCall', method, args: jsonArgs(args), gas, deposit };
  }

  private async account(id: string): Promise<{ amount: bigint; storage: bigint }> {
    const a = await this.rpc.call('query', { request_type: 'view_account', finality: 'optimistic', account_id: id });
    return { amount: BigInt(a.amount), storage: BigInt(a.storage_usage) * STORAGE_PRICE };
  }

  async houseBalance(): Promise<bigint> {
    const a = await this.account(this.houseId);
    return a.amount > a.storage ? a.amount - a.storage : 0n;
  }

  async createPlayer(pk: string) {
    const accountId = randomPlayerAccount(this.houseId);
    const tx = await this.house.send(accountId, [
      { kind: 'createAccount' },
      { kind: 'transfer', deposit: PLAYER_FUNDING },
      {
        kind: 'addKeyFunctionCall',
        publicKey: pk,
        allowance: PLAYER_ALLOWANCE,
        receiverId: this.contractId,
        methodNames: ['offer_leniency'],
      },
    ]);
    return { accountId, tx };
  }

  async ensureBuyerFunds(buyer: BuyerId, accountId: string, need: bigint): Promise<TxResult | null> {
    const a = await this.account(accountId);
    const spendable = a.amount > a.storage ? a.amount - a.storage : 0n;
    const gasReserve = nearToYocto('0.15');
    const target = need + gasReserve;
    if (spendable >= target) return null;
    return this.house.send(accountId, [{ kind: 'transfer', deposit: target - spendable }]);
  }

  async createSeason(player: string, buyers: string[], days: number, bond: bigint) {
    const r = await this.house.send(this.contractId, [
      this.fn('create_season', { player, buyers, days, bond: bond.toString() }),
    ]);
    let seasonId: number | undefined;
    if (r.ok && r.returnValue) {
      try {
        seasonId = Number(JSON.parse(atob(r.returnValue)));
      } catch {
        /* handled below */
      }
    }
    if (r.ok && seasonId === undefined) throw new AppError('TX_FAILED', 'create_season returned no season id');
    return { ...r, seasonId };
  }

  postBond(buyer: BuyerId, seasonId: number, bond: bigint) {
    return this.buyers[buyer].send(this.contractId, [this.fn('post_bond', { season_id: seasonId }, bond)]);
  }
  openLot(seasonId: number, species: string, fairValue: number) {
    return this.house.send(this.contractId, [
      this.fn('open_lot', { season_id: seasonId, species, fair_value: fairValue }),
    ]);
  }
  commitBid(buyer: BuyerId, seasonId: number, hash: Uint8Array) {
    return this.buyers[buyer].send(this.contractId, [
      this.fn('commit_bid', { season_id: seasonId, hash: toB64(hash) }),
    ]);
  }
  revealBid(buyer: BuyerId, seasonId: number, amount: number, salt: Uint8Array) {
    return this.buyers[buyer].send(this.contractId, [
      this.fn('reveal_bid', { season_id: seasonId, amount, salt: toB64(salt) }),
    ]);
  }
  settleLot(seasonId: number) {
    return this.house.send(this.contractId, [this.fn('settle_lot', { season_id: seasonId })]);
  }
  confess(buyer: BuyerId, seasonId: number, pact: PactJson, signatures: PactSigJson[]) {
    return this.buyers[buyer].send(this.contractId, [
      this.fn('confess', { season_id: seasonId, pact, signatures }, 0n, GAS_CONFESS),
    ]);
  }
  closeSeason(seasonId: number) {
    return this.house.send(this.contractId, [this.fn('close_season', { season_id: seasonId })]);
  }

  async view<T>(method: string, args: unknown): Promise<T> {
    const r = await this.rpc.call('query', {
      request_type: 'call_function',
      finality: 'optimistic',
      account_id: this.contractId,
      method_name: method,
      args_base64: toB64(jsonArgs(args)),
    });
    if (r.error) throw new AppError('TX_FAILED', `view ${method} failed`);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(r.result))) as T;
  }

  getSeason(seasonId: number): Promise<SeasonView> {
    return this.view<SeasonView>('get_season', { season_id: seasonId });
  }

  async verifyLeniencyTx(txHash: string, player: string, seasonId: number): Promise<LeniencyCheck> {
    let res: any = null;
    for (let i = 0; i < 12 && !res; i++) {
      try {
        res = await this.rpc.call('tx', {
          tx_hash: txHash,
          sender_account_id: player,
          wait_until: 'EXECUTED_OPTIMISTIC',
        });
      } catch (e) {
        if (!(e instanceof RpcError)) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!res) return { ok: false, errorCode: 'TX_NOT_FOUND' };
    const t = res.transaction ?? res.final_execution_outcome?.transaction;
    const fc = t?.actions?.[0]?.FunctionCall;
    let args: any = null;
    try {
      args = fc ? JSON.parse(atob(fc.args)) : null;
    } catch {
      args = null;
    }
    if (
      !t ||
      t.signer_id !== player ||
      t.receiver_id !== this.contractId ||
      t.actions.length !== 1 ||
      fc?.method_name !== 'offer_leniency' ||
      args?.season_id !== seasonId
    ) {
      return { ok: false, errorCode: 'TX_MISMATCH' };
    }
    const out = parseOutcome(txHash, res);
    if (!out.ok) return { ok: false, errorCode: out.errorCode, message: out.failure };
    return { ok: true };
  }
}
