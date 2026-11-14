//! Lowball: five buyers form a bid-rigging cartel; the player can offer leniency and the first
//! buyer to hand over the signed pact is immune while the other signers' bonds are slashed.

mod confess;
mod errors;
mod events;
mod leniency;
mod mt;
mod pact;
mod season;
mod views;

pub use errors::*;
pub use pact::{confession_message, pact_message, ConfessionMsg, Pact, PactSig, CONFESS_PREFIX, PACT_PREFIX};
pub use mt::{MtContractMetadata, MtToken, MtTokenMetadata};
pub use season::{PayoutRoute, Season, Status, BUYERS, MAX_DAYS, STALE_NS};
pub use views::*;

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, NearToken, PanicOnDefault, Promise};

/// Protocol constant `yield_timeout_length_in_blocks`: a yielded promise times out after this.
pub const YIELD_TIMEOUT_BLOCKS: u64 = 200;

use crate::season::BuyerSlot;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    house: AccountId,
    next_season_id: u64,
    seasons: LookupMap<u64, Season>,
    keys: LookupMap<AccountId, [u8; 32]>,
    /// Payout desk (Chain Signatures) called as `pay_evm` for seasons with a `payout_evm` address.
    desk: AccountId,
    /// NEP-245 index: account -> (season, day) tokens it holds (the contract itself = escrow).
    owner_tokens: LookupMap<AccountId, Vec<(u64, u8)>>,
}

fn pay(to: &AccountId, yocto: u128) {
    if yocto > 0 {
        let _ = Promise::new(to.clone()).transfer(NearToken::from_yoctonear(yocto));
    }
}

impl Contract {
    fn fresh(house: AccountId) -> Self {
        let desk = format!("desk.{}", env::current_account_id()).parse().unwrap_or_else(|_| env::current_account_id());
        Self {
            house,
            next_season_id: 0,
            seasons: LookupMap::new(b"s"),
            keys: LookupMap::new(b"k"),
            desk,
            owner_tokens: LookupMap::new(b"o"),
        }
    }

    fn only_house(&self) {
        ensure(env::predecessor_account_id() == self.house, E_NOT_HOUSE);
    }

    fn season(&mut self, id: u64) -> &mut Season {
        self.seasons.get_mut(&id).unwrap_or_else(|| env::panic_str(E_NO_SEASON))
    }
}

#[near]
impl Contract {
    #[init]
    pub fn new(house: AccountId) -> Self {
        Self::fresh(house)
    }

    /// Wipe state and re-initialise. Callable only by the contract account itself (the deploy script
    /// signs with the contract key), used when a redeploy finds an incompatible old state layout.
    #[init(ignore_state)]
    pub fn reset(house: AccountId) -> Self {
        ensure(env::predecessor_account_id() == env::current_account_id(), E_NOT_CONTRACT);
        Self::fresh(house)
    }

    /// House only: point at a different payout desk (default `desk.<this account>`).
    pub fn set_desk(&mut self, desk: AccountId) {
        self.only_house();
        self.desk = desk;
    }

    /// Called by the buyer account: registers (or replaces) its 32-byte ed25519 pact key.
    /// Seasons snapshot the key at creation, so replacing it never affects a running season.
    pub fn register_buyer_key(&mut self, public_key: Base64VecU8) {
        let pk: [u8; 32] = public_key.0.as_slice().try_into().unwrap_or_else(|_| env::panic_str(E_BAD_KEY));
        self.keys.insert(env::predecessor_account_id(), pk);
    }

    /// `payout_evm`: optional `0x` + 40 hex address; slashed NEAR is then paid out cross-chain.
    pub fn create_season(
        &mut self,
        player: AccountId,
        buyers: Vec<AccountId>,
        days: u8,
        bond: U128,
        payout_evm: Option<String>,
    ) -> u64 {
        self.only_house();
        if let Some(a) = &payout_evm {
            ensure(a.len() == 42 && a.starts_with("0x") && a[2..].bytes().all(|c| c.is_ascii_hexdigit()), E_BAD_EVM);
        }
        ensure(buyers.len() == BUYERS, E_BAD_ARGS);
        ensure(days >= 1 && days <= MAX_DAYS && bond.0 > 0, E_BAD_ARGS);
        for (i, b) in buyers.iter().enumerate() {
            ensure(!buyers[..i].contains(b) && *b != player, E_BAD_ARGS);
        }
        let slots: Vec<BuyerSlot> = buyers
            .into_iter()
            .map(|account| {
                let pk = *self.keys.get(&account).unwrap_or_else(|| env::panic_str(E_NO_KEY));
                BuyerSlot { account, pk, posted: false, slashed: false, refunded: false }
            })
            .collect();
        let id = self.next_season_id;
        self.next_season_id += 1;
        let s = Season {
            player,
            buyers: slots,
            days,
            bond: bond.0,
            day: 0,
            status: Status::Open,
            lots: vec![],
            leniency_day: None,
            first_confessor: None,
            verified_signers: vec![],
            slashed_total: 0,
            player_payout: 0,
            shortfall: 0,
            pact_cap: None,
            pact_nonce: None,
            confessed_day: None,
            last_activity_ns: env::block_timestamp(),
            leniency_window: 0,
            leniency_yield: None,
            leniency_open_block: 0,
            holdouts: 0,
            payout_evm,
            payout_route: PayoutRoute::None,
        };
        self.seasons.insert(id, s);
        id
    }

    #[payable]
    pub fn post_bond(&mut self, season_id: u64) {
        let who = env::predecessor_account_id();
        let paid = env::attached_deposit().as_yoctonear();
        let s = self.season(season_id);
        s.ensure_open();
        let i = s.buyer_idx(&who) as usize;
        ensure(!s.buyers[i].posted, E_BOND_POSTED);
        ensure(paid == s.bond, E_BAD_DEPOSIT);
        s.buyers[i].posted = true;
        s.touch();
    }

    /// Opens the next day's lot and mints its NEP-245 token (`weight_kg` units) into escrow.
    pub fn open_lot(&mut self, season_id: u64, species: String, fair_value: u32, weight_kg: u32) {
        self.only_house();
        let player = {
            let s = self.season(season_id);
            s.open_lot(species, fair_value, weight_kg);
            s.player.clone()
        };
        self.mint_open_lot(season_id, &player);
    }

    pub fn commit_bid(&mut self, season_id: u64, hash: Base64VecU8) {
        let who = env::predecessor_account_id();
        self.season(season_id).commit_bid(&who, &hash.0);
    }

    pub fn reveal_bid(&mut self, season_id: u64, amount: u32, salt: Base64VecU8) {
        let who = env::predecessor_account_id();
        self.season(season_id).reveal_bid(&who, amount, &salt.0);
    }

    /// Anyone once all five bids are revealed; the house may also settle with a partial reveal set.
    pub fn settle_lot(&mut self, season_id: u64) {
        let is_house = env::predecessor_account_id() == self.house;
        self.season(season_id).settle_lot(is_house);
        self.deliver_settled_lot(season_id);
    }

    /// Buyer reclaims own bond once the season is no longer Open (unless slashed).
    pub fn withdraw_bond(&mut self, season_id: u64) {
        let who = env::predecessor_account_id();
        let s = self.season(season_id);
        let i = s.buyer_idx(&who) as usize;
        ensure(s.status != Status::Open, E_SEASON_OPEN);
        ensure(s.buyers[i].posted, E_NO_BOND);
        ensure(!s.buyers[i].slashed, E_SLASHED);
        ensure(!s.buyers[i].refunded, E_ALREADY_WITHDRAWN);
        s.buyers[i].refunded = true;
        let bond = s.bond;
        pay(&who, bond);
    }

    /// House any time; anyone once the last lot is settled or the season is stale (3 days idle).
    pub fn close_season(&mut self, season_id: u64) {
        let is_house = env::predecessor_account_id() == self.house;
        let s = self.season(season_id);
        ensure(s.status != Status::Closed, E_CLOSED);
        let stale = env::block_timestamp().saturating_sub(s.last_activity_ns) > STALE_NS;
        ensure(is_house || s.last_lot_settled() || stale, E_NOT_FINISHED);
        let mut refunds: Vec<AccountId> = vec![];
        let had_open_lot = s.lots.last().map(|l| !l.settled).unwrap_or(false);
        for b in s.buyers.iter_mut() {
            if b.posted && !b.slashed && !b.refunded {
                b.refunded = true;
                refunds.push(b.account.clone());
            }
        }
        s.status = Status::Closed;
        s.leniency_yield = None;
        let bond = s.bond;
        for a in refunds {
            pay(&a, bond);
        }
        if had_open_lot {
            self.return_open_lot(season_id);
        }
    }

    pub fn get_season(&self, season_id: u64) -> SeasonView {
        let s = self.seasons.get(&season_id).unwrap_or_else(|| env::panic_str(E_NO_SEASON));
        season_view(season_id, s)
    }

    pub fn get_buyer_key(&self, account: AccountId) -> Option<Base64VecU8> {
        self.keys.get(&account).map(|k| Base64VecU8(k.to_vec()))
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            house: self.house.clone(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            season_count: self.next_season_id,
            max_days: MAX_DAYS,
            buyers_per_season: BUYERS as u8,
            pact_prefix: String::from_utf8(PACT_PREFIX.to_vec()).unwrap(),
        }
    }
}

#[cfg(test)]
mod unit_tests;
