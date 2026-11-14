//! NEP-245 multi-token surface for the catch. One token per lot, id `s{season}-d{day}`, supply =
//! weight in kg. A lot is indivisible: it has exactly one holder at a time (escrow = this contract
//! until the lot settles), so `mt_transfer` moves the whole amount.

use near_sdk::json_types::U128;
use near_sdk::serde::Serialize;
use near_sdk::{env, near, AccountId};

use crate::errors::*;
use crate::events;
use crate::season::Lot;
use crate::{Contract, ContractExt};

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct MtContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct MtTokenMetadata {
    pub title: String,
    pub description: String,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub copies: Option<u64>,
    /// ms since epoch, as a string (NEP-245 metadata convention).
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    /// JSON string: species, weight_kg, fair_value, season_id, day.
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct MtToken {
    pub token_id: String,
    /// The single holder (the contract account while escrowed).
    pub owner_id: AccountId,
    /// Total supply == the holder's balance, in kg.
    pub supply: U128,
    pub metadata: MtTokenMetadata,
}

pub fn token_id(season: u64, day: u8) -> String {
    format!("s{season}-d{day}")
}

pub fn parse_token_id(t: &str) -> Option<(u64, u8)> {
    let rest = t.strip_prefix('s')?;
    let (s, d) = rest.split_once("-d")?;
    Some((s.parse().ok()?, d.parse().ok()?))
}

fn metadata(season: u64, l: &Lot) -> MtTokenMetadata {
    let extra = near_sdk::serde_json::json!({
        "species": l.species, "weight_kg": l.weight_kg, "fair_value": l.fair_value, "season_id": season, "day": l.day
    });
    MtTokenMetadata {
        title: format!("{} kg {} — season {}, day {}", l.weight_kg, l.species, season, l.day),
        description: format!("Catch lot, fair value {} marks. Held in escrow until the auction settles.", l.fair_value),
        media: None,
        media_hash: None,
        copies: Some(1),
        issued_at: Some((l.opened_ns / 1_000_000).to_string()),
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: Some(extra.to_string()),
        reference: None,
        reference_hash: None,
    }
}

impl Contract {
    fn lot_of(&self, season: u64, day: u8) -> Option<&Lot> {
        let s = self.seasons.get(&season)?;
        s.lots.iter().find(|l| l.day == day)
    }

    fn token(&self, t: &str) -> Option<MtToken> {
        let (season, day) = parse_token_id(t)?;
        let l = self.lot_of(season, day)?;
        Some(MtToken { token_id: token_id(season, day), owner_id: l.owner.clone(), supply: U128(l.weight_kg as u128), metadata: metadata(season, l) })
    }

    fn index_add(&mut self, who: &AccountId, t: (u64, u8)) {
        let mut v = self.owner_tokens.get(who).cloned().unwrap_or_default();
        if !v.contains(&t) {
            v.push(t);
        }
        self.owner_tokens.insert(who.clone(), v);
    }

    fn index_remove(&mut self, who: &AccountId, t: (u64, u8)) {
        if let Some(v) = self.owner_tokens.get(who).cloned() {
            let v: Vec<_> = v.into_iter().filter(|x| *x != t).collect();
            self.owner_tokens.insert(who.clone(), v);
        }
    }

    /// Mint the just-opened lot into escrow (the contract account, on behalf of the player).
    pub(crate) fn mint_open_lot(&mut self, season: u64, player: &AccountId) {
        let l = self.seasons.get(&season).and_then(|s| s.lots.last()).unwrap_or_else(|| env::panic_str(E_NO_LOT));
        let (day, w) = (l.day, l.weight_kg);
        let escrow = env::current_account_id();
        self.index_add(&escrow, (season, day));
        events::mt_mint(&escrow, &token_id(season, day), w, &format!("escrow for {player}"));
    }

    /// Move a whole lot token to a new holder, updating the index and emitting `mt_transfer`.
    pub(crate) fn move_lot(&mut self, season: u64, day: u8, to: &AccountId, memo: &str) {
        let s = self.seasons.get_mut(&season).unwrap_or_else(|| env::panic_str(E_NO_SEASON));
        let l = s.lots.iter_mut().find(|l| l.day == day).unwrap_or_else(|| env::panic_str(E_NO_TOKEN));
        let (from, w) = (l.owner.clone(), l.weight_kg);
        l.owner = to.clone();
        self.index_remove(&from, (season, day));
        self.index_add(to, (season, day));
        events::mt_transfer(&from, to, &token_id(season, day), w, memo);
    }

    /// After `settle_lot`: escrow -> winning buyer, memo "sold at <price> marks".
    pub(crate) fn deliver_settled_lot(&mut self, season: u64) {
        let s = self.seasons.get(&season).unwrap_or_else(|| env::panic_str(E_NO_SEASON));
        let l = s.lots.last().unwrap_or_else(|| env::panic_str(E_NO_LOT));
        let (day, price) = (l.day, l.price);
        match l.winner {
            Some(w) => {
                let to = s.buyers[w as usize].account.clone();
                self.move_lot(season, day, &to, &format!("sold at {price} marks"));
            }
            None => self.return_open_lot(season),
        }
    }

    /// Season ends with an unsold lot still in escrow: back to the player.
    pub(crate) fn return_open_lot(&mut self, season: u64) {
        let s = self.seasons.get(&season).unwrap_or_else(|| env::panic_str(E_NO_SEASON));
        let escrow = env::current_account_id();
        if let Some(l) = s.lots.last() {
            if !l.settled && l.owner == escrow {
                let (day, player) = (l.day, s.player.clone());
                self.move_lot(season, day, &player, "returned unsold");
            }
        }
    }

    fn mt_move(&mut self, to: AccountId, t: &str, amount: U128, memo: Option<String>) {
        ensure(env::attached_deposit().as_yoctonear() == 1, E_NEED_1_YOCTO);
        let from = env::predecessor_account_id();
        ensure(from != to, E_SELF_TRANSFER);
        let (season, day) = parse_token_id(t).unwrap_or_else(|| env::panic_str(E_NO_TOKEN));
        let l = self.lot_of(season, day).unwrap_or_else(|| env::panic_str(E_NO_TOKEN));
        ensure(l.owner == from, E_NOT_TOKEN_OWNER);
        ensure(amount.0 == l.weight_kg as u128, E_MT_PARTIAL);
        self.move_lot(season, day, &to, &memo.unwrap_or_default());
    }
}

#[near]
impl Contract {
    pub fn mt_metadata_contract(&self) -> MtContractMetadata {
        MtContractMetadata {
            spec: "mt-1.0.0".into(),
            name: "Lowball Catch".into(),
            symbol: "CATCH".into(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<MtToken>> {
        token_ids.iter().map(|t| self.token(t)).collect()
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.token(&token_id).filter(|t| t.owner_id == account_id).map(|t| t.supply.0).unwrap_or(0))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.into_iter().map(|t| self.mt_balance_of(account_id.clone(), t)).collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.token(&token_id).map(|t| t.supply)
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }

    /// All tokens, in (season, day) order.
    pub fn mt_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<MtToken> {
        let (skip, take) = (from_index.map(|f| f.0 as usize).unwrap_or(0), limit.unwrap_or(50) as usize);
        let mut out = vec![];
        let mut seen = 0usize;
        for sid in 0..self.next_season_id {
            let Some(s) = self.seasons.get(&sid) else { continue };
            for l in &s.lots {
                if seen >= skip && out.len() < take {
                    out.extend(self.token(&token_id(sid, l.day)));
                }
                seen += 1;
            }
        }
        out
    }

    pub fn mt_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<MtToken> {
        let (skip, take) = (from_index.map(|f| f.0 as usize).unwrap_or(0), limit.unwrap_or(50) as usize);
        let held = self.owner_tokens.get(&account_id).cloned().unwrap_or_default();
        held.into_iter().skip(skip).take(take).filter_map(|(s, d)| self.token(&token_id(s, d))).collect()
    }

    /// NEP-245 metadata provider: metadata only (no owner), one entry per id, null for unknown ids.
    pub fn mt_metadata_token_by_token_id(&self, token_ids: Vec<String>) -> Vec<Option<MtTokenMetadata>> {
        token_ids.iter().map(|t| self.token(t).map(|x| x.metadata)).collect()
    }

    /// Whole-lot transfer from the caller to `receiver_id`. Requires exactly 1 yoctoNEAR.
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        #[allow(unused_variables)] approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        self.mt_move(receiver_id, &token_id, amount, memo);
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        #[allow(unused_variables)] approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        ensure(token_ids.len() == amounts.len() && !token_ids.is_empty(), E_BAD_ARGS);
        for (t, a) in token_ids.iter().zip(amounts) {
            self.mt_move(receiver_id.clone(), t, a, memo.clone());
        }
    }
}
