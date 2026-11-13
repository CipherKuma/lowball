//! JSON view types. u128 values are decimal strings (U128); `pact_nonce` is a string (U64)
//! because a 64-bit nonce does not survive a JS number.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde::Serialize;
use near_sdk::AccountId;

use crate::season::{Lot, Season};

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RevealView {
    pub buyer: AccountId,
    pub amount: u32,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct LotView {
    pub day: u8,
    pub species: String,
    pub fair_value: u32,
    /// Buyers that have committed to the open lot (empty once settled).
    pub committed: Vec<AccountId>,
    pub reveals: Vec<RevealView>,
    pub settled: bool,
    pub winner: Option<AccountId>,
    pub price: u32,
    pub identical: bool,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct BondView {
    pub buyer: AccountId,
    pub posted: bool,
    pub slashed: bool,
    pub refunded: bool,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct SeasonView {
    pub season_id: u64,
    pub player: AccountId,
    pub buyers: Vec<AccountId>,
    pub bonds: Vec<BondView>,
    pub bond: U128,
    pub day: u8,
    pub days: u8,
    /// "Open" | "Confessed" | "Closed"
    pub status: String,
    pub lots: Vec<LotView>,
    pub leniency_day: Option<u8>,
    /// true while the current day's leniency window is open and nobody has confessed
    pub leniency_open: bool,
    pub first_confessor: Option<AccountId>,
    pub verified_signers: Vec<AccountId>,
    pub slashed_total: U128,
    pub player_payout: U128,
    pub shortfall: u64,
    pub pact_cap: Option<u32>,
    pub pact_nonce: Option<U64>,
    pub confessed_day: Option<u8>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ConfigView {
    pub house: AccountId,
    pub version: String,
    pub season_count: u64,
    pub max_days: u8,
    pub buyers_per_season: u8,
    pub pact_prefix: String,
}

fn lot_view(s: &Season, l: &Lot) -> LotView {
    LotView {
        day: l.day,
        species: l.species.clone(),
        fair_value: l.fair_value,
        committed: l.commits.iter().map(|(b, _)| s.buyers[*b as usize].account.clone()).collect(),
        reveals: l
            .reveals
            .iter()
            .map(|(b, a)| RevealView { buyer: s.buyers[*b as usize].account.clone(), amount: *a })
            .collect(),
        settled: l.settled,
        winner: l.winner.map(|w| s.buyers[w as usize].account.clone()),
        price: l.price,
        identical: l.identical,
    }
}

pub fn season_view(id: u64, s: &Season) -> SeasonView {
    let acct = |i: &u8| s.buyers[*i as usize].account.clone();
    SeasonView {
        season_id: id,
        player: s.player.clone(),
        buyers: s.buyers.iter().map(|b| b.account.clone()).collect(),
        bonds: s
            .buyers
            .iter()
            .map(|b| BondView { buyer: b.account.clone(), posted: b.posted, slashed: b.slashed, refunded: b.refunded })
            .collect(),
        bond: U128(s.bond),
        day: s.day,
        days: s.days,
        status: s.status.as_str().to_string(),
        lots: s.lots.iter().map(|l| lot_view(s, l)).collect(),
        leniency_day: s.leniency_day,
        leniency_open: s.status == crate::season::Status::Open && s.leniency_day.is_some() && s.leniency_day == Some(s.day),
        first_confessor: s.first_confessor.as_ref().map(acct),
        verified_signers: s.verified_signers.iter().map(acct).collect(),
        slashed_total: U128(s.slashed_total),
        player_payout: U128(s.player_payout),
        shortfall: s.shortfall,
        pact_cap: s.pact_cap,
        pact_nonce: s.pact_nonce.map(U64),
        confessed_day: s.confessed_day,
    }
}
