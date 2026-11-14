//! NEP-297 event logs: `EVENT_JSON:{"standard":..,"version":"1.0.0","event":..,"data":[{..}]}`.
//! Two standards: `lowball` (game events) and `nep245` (fish-token mint/transfer).

use near_sdk::serde_json::{json, Value};
use near_sdk::{env, AccountId};

pub const GAME_STANDARD: &str = "lowball";
pub const MT_STANDARD: &str = "nep245";
pub const VERSION: &str = "1.0.0";

fn emit(standard: &str, event: &str, data: Value) {
    let body = json!({"standard": standard, "version": VERSION, "event": event, "data": [data]});
    env::log_str(&format!("EVENT_JSON:{body}"));
}

pub fn game(event: &str, data: Value) {
    emit(GAME_STANDARD, event, data);
}

pub fn mt_mint(owner: &AccountId, token_id: &str, amount: u32, memo: &str) {
    emit(
        MT_STANDARD,
        "mt_mint",
        json!({"owner_id": owner, "token_ids": [token_id], "amounts": [amount.to_string()], "memo": memo}),
    );
}

pub fn mt_transfer(from: &AccountId, to: &AccountId, token_id: &str, amount: u32, memo: &str) {
    emit(
        MT_STANDARD,
        "mt_transfer",
        json!({"old_owner_id": from, "new_owner_id": to, "token_ids": [token_id], "amounts": [amount.to_string()], "memo": memo}),
    );
}
