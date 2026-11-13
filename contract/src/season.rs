//! Season state and pure game logic (no promises here; lib.rs moves money).

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{env, AccountId};

use crate::errors::*;

pub const MAX_DAYS: u8 = 30;
pub const BUYERS: usize = 5;
/// Anyone may close a season nobody has touched for this long, so bonds can never be stranded.
pub const STALE_NS: u64 = 3 * 24 * 3600 * 1_000_000_000;

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub enum Status {
    Open,
    Confessed,
    Closed,
}

impl Status {
    pub fn as_str(&self) -> &'static str {
        match self {
            Status::Open => "Open",
            Status::Confessed => "Confessed",
            Status::Closed => "Closed",
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct BuyerSlot {
    pub account: AccountId,
    /// ed25519 key snapshotted from the registry at create_season (re-registering later cannot change it).
    pub pk: [u8; 32],
    pub posted: bool,
    pub slashed: bool,
    pub refunded: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Lot {
    pub day: u8,
    pub species: String,
    pub fair_value: u32,
    /// (buyer index, sha256 commitment). Cleared at settlement.
    pub commits: Vec<(u8, [u8; 32])>,
    /// (buyer index, amount) in reveal order.
    pub reveals: Vec<(u8, u32)>,
    pub settled: bool,
    pub winner: Option<u8>,
    pub price: u32,
    pub identical: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Season {
    pub player: AccountId,
    pub buyers: Vec<BuyerSlot>,
    pub days: u8,
    pub bond: u128,
    pub day: u8,
    pub status: Status,
    pub lots: Vec<Lot>,
    pub leniency_day: Option<u8>,
    pub first_confessor: Option<u8>,
    pub verified_signers: Vec<u8>,
    pub slashed_total: u128,
    pub player_payout: u128,
    pub shortfall: u64,
    pub pact_cap: Option<u32>,
    pub pact_nonce: Option<u64>,
    pub confessed_day: Option<u8>,
    pub last_activity_ns: u64,
}

impl Season {
    pub fn idx(&self, who: &AccountId) -> Option<u8> {
        self.buyers.iter().position(|b| &b.account == who).map(|i| i as u8)
    }

    pub fn buyer_idx(&self, who: &AccountId) -> u8 {
        self.idx(who).unwrap_or_else(|| env::panic_str(E_NOT_BUYER))
    }

    pub fn all_bonds_posted(&self) -> bool {
        self.buyers.iter().all(|b| b.posted)
    }

    pub fn touch(&mut self) {
        self.last_activity_ns = env::block_timestamp();
    }

    /// The lot currently accepting bids (opened, not yet settled).
    pub fn open_lot_mut(&mut self) -> &mut Lot {
        match self.lots.last_mut() {
            Some(l) if !l.settled => l,
            _ => env::panic_str(E_NO_LOT),
        }
    }

    pub fn ensure_open(&self) {
        match self.status {
            Status::Open => {}
            Status::Closed => env::panic_str(E_CLOSED),
            Status::Confessed => env::panic_str(E_SEASON_OVER),
        }
    }

    pub fn last_lot_settled(&self) -> bool {
        self.day == self.days && self.lots.last().map(|l| l.settled).unwrap_or(false)
    }

    pub fn open_lot(&mut self, species: String, fair_value: u32) {
        self.ensure_open();
        ensure(!species.is_empty() && species.len() <= 64 && fair_value > 0, E_BAD_ARGS);
        ensure(self.all_bonds_posted(), E_BONDS_MISSING);
        ensure(self.lots.last().map(|l| l.settled).unwrap_or(true), E_LOT_OPEN);
        ensure(self.day < self.days, E_PAST_DAYS);
        self.day += 1;
        self.lots.push(Lot {
            day: self.day,
            species,
            fair_value,
            commits: vec![],
            reveals: vec![],
            settled: false,
            winner: None,
            price: 0,
            identical: false,
        });
        self.touch();
    }

    pub fn commit_bid(&mut self, who: &AccountId, hash: &[u8]) {
        self.ensure_open();
        let i = self.buyer_idx(who);
        ensure(self.buyers[i as usize].posted, E_NO_BOND);
        ensure(hash.len() == 32, E_BAD_ARGS);
        let lot = self.open_lot_mut();
        ensure(!lot.commits.iter().any(|(b, _)| *b == i), E_ALREADY_COMMITTED);
        let mut h = [0u8; 32];
        h.copy_from_slice(hash);
        lot.commits.push((i, h));
        self.touch();
    }

    pub fn reveal_bid(&mut self, who: &AccountId, amount: u32, salt: &[u8]) {
        self.ensure_open();
        let i = self.buyer_idx(who);
        let lot = self.open_lot_mut();
        let commit = lot
            .commits
            .iter()
            .find(|(b, _)| *b == i)
            .map(|(_, h)| *h)
            .unwrap_or_else(|| env::panic_str(E_NO_COMMIT));
        ensure(!lot.reveals.iter().any(|(b, _)| *b == i), E_ALREADY_REVEALED);
        ensure(salt.len() == 32, E_BAD_REVEAL);
        let mut pre = amount.to_le_bytes().to_vec();
        pre.extend_from_slice(salt);
        ensure(env::sha256_array(&pre) == commit, E_BAD_REVEAL);
        lot.reveals.push((i, amount));
        self.touch();
    }

    /// `force` = house settling with a partial reveal set (needs at least one reveal).
    pub fn settle_lot(&mut self, force: bool) {
        self.ensure_open();
        let lot = self.open_lot_mut();
        let all = lot.reveals.len() == BUYERS;
        ensure(all || (force && !lot.reveals.is_empty()), E_NOT_READY);
        let mut best: Option<(u8, u32)> = None;
        for &(b, a) in &lot.reveals {
            // strictly greater: a tie keeps the earliest reveal
            if best.map(|(_, ba)| a > ba).unwrap_or(true) {
                best = Some((b, a));
            }
        }
        let (w, price) = best.unwrap();
        lot.identical = all && lot.reveals.iter().all(|&(_, a)| a == price);
        lot.winner = Some(w);
        lot.price = price;
        lot.settled = true;
        lot.commits.clear();
        let short = lot.fair_value.saturating_sub(price) as u64;
        self.shortfall += short;
        self.touch();
    }
}
