//! On-chain leniency clock (NEP-519 yield/resume). `offer_leniency` yields a promise that either
//! a confession resumes (the callback then settles the window at once) or the protocol times out
//! after 200 blocks (the callback then records a holdout).

use near_sdk::serde_json::json;
use near_sdk::{env, near, Gas, GasWeight, YieldId};

use crate::errors::*;
use crate::events;
use crate::season::Status;
use crate::{Contract, ContractExt, YIELD_TIMEOUT_BLOCKS};

const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[near]
impl Contract {
    /// Player only (signed in the browser). Opens a leniency window for the current day and starts
    /// its yield clock. The yield is deliberately NOT returned, so this transaction finishes now;
    /// the callback receipt lands on confession or ~200 blocks later.
    pub fn offer_leniency(&mut self, season_id: u64) {
        let who = env::predecessor_account_id();
        let s = self.season(season_id);
        ensure(who == s.player, E_NOT_PLAYER);
        s.ensure_open();
        ensure(s.day >= 1, E_NO_DAY);
        ensure(!(s.leniency_yield.is_some() && s.leniency_day == Some(s.day)), E_LENIENCY_OPEN);
        s.leniency_window += 1;
        let (window, day, block) = (s.leniency_window, s.day, env::block_height());
        let args = json!({"season_id": season_id, "window": window, "day": day}).to_string();
        let (_promise, yield_id) = env::promise_yield_create_id("on_leniency_end", args, CALLBACK_GAS, GasWeight(0));
        s.leniency_yield = Some(yield_id);
        s.leniency_day = Some(day);
        s.leniency_open_block = block;
        s.touch();
        events::game(
            "leniency_open",
            json!({"season_id": season_id, "player": who, "day": day, "window": window,
                   "open_block": block, "deadline_block": block + YIELD_TIMEOUT_BLOCKS}),
        );
    }

    /// Yield callback. Payload present = a confession resumed it; PromiseError = 200-block timeout.
    #[private]
    pub fn on_leniency_end(&mut self, season_id: u64, window: u32, day: u8) {
        let resumed = env::promise_result_checked(0, 256).is_ok();
        let s = self.season(season_id);
        if s.leniency_window == window {
            s.leniency_yield = None;
        }
        if resumed {
            return; // the confession path already emitted `confession` / `slash`
        }
        if s.status == Status::Open {
            s.holdouts += 1;
            let holdouts = s.holdouts;
            events::game(
                "holdout",
                json!({"season_id": season_id, "day": day, "window": window, "reason": "timeout", "holdouts": holdouts}),
            );
        }
    }
}

/// Resume payload for a confession (read by tests/explorers; the callback only needs "resumed").
pub fn resume(yield_id: YieldId, confessor: &near_sdk::AccountId, season_id: u64) {
    let payload = json!({"confessor": confessor, "season_id": season_id}).to_string();
    if yield_id.resume(payload).is_err() {
        env::panic_str(E_NO_LENIENCY);
    }
}
