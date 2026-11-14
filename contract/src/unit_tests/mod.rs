use crate::*;
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};

pub(crate) const BOND: u128 = 1_000_000_000_000_000_000_000_000;

pub(crate) fn a(s: &str) -> AccountId {
    s.parse().unwrap()
}
pub(crate) fn buyers() -> Vec<AccountId> {
    (1..=5).map(|i| a(&format!("b{i}.testnet"))).collect()
}
pub(crate) fn as_(who: &str, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(a(who))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .build());
}
pub(crate) fn b64(v: &[u8]) -> Base64VecU8 {
    Base64VecU8(v.to_vec())
}
pub(crate) fn commit_hash(amount: u32, salt: &[u8; 32]) -> Base64VecU8 {
    let mut pre = amount.to_le_bytes().to_vec();
    pre.extend_from_slice(salt);
    b64(&near_sdk::env::sha256(&pre))
}

/// Contract with 5 registered buyers; season 0 created (days = `days`).
pub(crate) fn fresh(days: u8) -> Contract {
    as_("house.testnet", 0);
    let mut c = Contract::new(a("house.testnet"));
    for (i, b) in buyers().iter().enumerate() {
        as_(b.as_str(), 0);
        c.register_buyer_key(b64(&[i as u8 + 1; 32]));
    }
    as_("house.testnet", 0);
    assert_eq!(c.create_season(a("player.testnet"), buyers(), days, U128(BOND), None), 0);
    c
}
pub(crate) fn bonded(days: u8) -> Contract {
    let mut c = fresh(days);
    for b in buyers() {
        as_(b.as_str(), BOND);
        c.post_bond(0);
    }
    c
}
pub(crate) fn lot_with_reveals(c: &mut Contract, amounts: &[u32]) {
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    for (i, amt) in amounts.iter().enumerate() {
        let salt = [i as u8; 32];
        as_(&format!("b{}.testnet", i + 1), 0);
        c.commit_bid(0, commit_hash(*amt, &salt));
    }
    for (i, amt) in amounts.iter().enumerate() {
        as_(&format!("b{}.testnet", i + 1), 0);
        c.reveal_bid(0, *amt, b64(&[i as u8; 32]));
    }
}

mod errors;
mod logic;
mod u123;
