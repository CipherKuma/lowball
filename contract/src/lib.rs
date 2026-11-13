//! Lowball: five buyers form a bid-rigging cartel; the player can offer leniency and the first
//! buyer to hand over the signed pact is immune while the other signers' bonds are slashed.

mod errors;
mod pact;
mod season;
mod views;

pub use errors::*;
pub use pact::{pact_message, Pact, PactSig, PACT_PREFIX};
pub use season::{Season, Status, BUYERS, MAX_DAYS, STALE_NS};
pub use views::*;

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, NearToken, PanicOnDefault, Promise};

use crate::season::BuyerSlot;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    house: AccountId,
    next_season_id: u64,
    seasons: LookupMap<u64, Season>,
    keys: LookupMap<AccountId, [u8; 32]>,
}

fn pay(to: &AccountId, yocto: u128) {
    if yocto > 0 {
        let _ = Promise::new(to.clone()).transfer(NearToken::from_yoctonear(yocto));
    }
}

impl Contract {
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
        Self { house, next_season_id: 0, seasons: LookupMap::new(b"s"), keys: LookupMap::new(b"k") }
    }

    /// Called by the buyer account: registers (or replaces) its 32-byte ed25519 pact key.
    /// Seasons snapshot the key at creation, so replacing it never affects a running season.
    pub fn register_buyer_key(&mut self, public_key: Base64VecU8) {
        let pk: [u8; 32] = public_key.0.as_slice().try_into().unwrap_or_else(|_| env::panic_str(E_BAD_KEY));
        self.keys.insert(env::predecessor_account_id(), pk);
    }

    pub fn create_season(&mut self, player: AccountId, buyers: Vec<AccountId>, days: u8, bond: U128) -> u64 {
        self.only_house();
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

    pub fn open_lot(&mut self, season_id: u64, species: String, fair_value: u32) {
        self.only_house();
        self.season(season_id).open_lot(species, fair_value);
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
    }

    /// Player only (signed in the browser). Opens the leniency window for the current day.
    pub fn offer_leniency(&mut self, season_id: u64) {
        let who = env::predecessor_account_id();
        let s = self.season(season_id);
        ensure(who == s.player, E_NOT_PLAYER);
        s.ensure_open();
        ensure(s.day >= 1, E_NO_DAY);
        if s.leniency_day != Some(s.day) {
            s.leniency_day = Some(s.day);
            s.touch();
        }
    }

    /// First valid confession wins immunity; the other verified signers' bonds go to the player.
    pub fn confess(&mut self, season_id: u64, pact: Pact, signatures: Vec<PactSig>) -> U128 {
        let caller = env::predecessor_account_id();
        let s = self.season(season_id);
        let (ci, signers) = pact::verify_confession(s, season_id, &caller, &pact, &signatures);
        let mut slashed = 0u128;
        for &i in &signers {
            if i != ci {
                s.buyers[i as usize].slashed = true;
                slashed += s.bond;
            }
        }
        s.buyers[ci as usize].refunded = true;
        s.status = Status::Confessed;
        s.first_confessor = Some(ci);
        s.verified_signers = signers;
        s.slashed_total = slashed;
        s.player_payout = slashed;
        s.pact_cap = Some(pact.cap);
        s.pact_nonce = Some(pact.nonce);
        s.confessed_day = Some(s.day);
        s.touch();
        let (player, bond) = (s.player.clone(), s.bond);
        pay(&player, slashed);
        pay(&caller, bond);
        U128(slashed)
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
        for b in s.buyers.iter_mut() {
            if b.posted && !b.slashed && !b.refunded {
                b.refunded = true;
                refunds.push(b.account.clone());
            }
        }
        s.status = Status::Closed;
        let bond = s.bond;
        for a in refunds {
            pay(&a, bond);
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
