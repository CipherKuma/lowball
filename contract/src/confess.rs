//! `confess`: first valid confession wins immunity, resumes the leniency yield, slashes the other
//! verified signers and pays the player (directly, or via the Chain Signatures payout desk).

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, Gas, NearToken, Promise};

use crate::errors::*;
use crate::pact::{self, Pact, PactSig};
use crate::season::{PayoutRoute, Status};
use crate::{events, leniency, pay, Contract, ContractExt};

const CALLBACK_GAS: Gas = Gas::from_tgas(10);
/// Most gas handed to `desk.pay_evm` (it makes the MPC signing call); capped by what is left.
const DESK_GAS_MAX: Gas = Gas::from_tgas(200);
const RESERVE_GAS: Gas = Gas::from_tgas(8);

#[near]
impl Contract {
    /// `confession_sig`: the caller's own pact-key signature over `confession_message` (see PACT_ENCODING.md).
    pub fn confess(&mut self, season_id: u64, pact: Pact, signatures: Vec<PactSig>, confession_sig: Base64VecU8) -> U128 {
        let caller = env::predecessor_account_id();
        let desk = self.desk.clone();
        let s = self.season(season_id);
        let (ci, signers) = pact::verify_confession(s, season_id, &caller, &pact, &signatures, &confession_sig.0);
        // Resume the yield first: a refused resume (window timed out this very block) aborts everything.
        leniency::resume(s.leniency_yield.unwrap_or_else(|| env::panic_str(E_NO_LENIENCY)), &caller, season_id);
        let mut slashed = 0u128;
        let mut slashed_list = vec![];
        for &i in &signers {
            if i != ci {
                s.buyers[i as usize].slashed = true;
                slashed += s.bond;
                slashed_list.push(json!({"buyer": s.buyers[i as usize].account, "yocto": s.bond.to_string()}));
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
        let (player, bond, day, evm) = (s.player.clone(), s.bond, s.day, s.payout_evm.clone());
        let signer_accts: Vec<AccountId> =
            s.verified_signers.iter().map(|&i| s.buyers[i as usize].account.clone()).collect();
        s.payout_route = if evm.is_some() { PayoutRoute::EvmPending } else { PayoutRoute::Near };
        pay(&caller, bond);
        match &evm {
            None => pay(&player, slashed),
            Some(to) => self.pay_via_desk(&desk, season_id, to, slashed, &player),
        }
        events::game(
            "confession",
            json!({"season_id": season_id, "confessor": caller, "day": day, "cap": pact.cap,
                   "nonce": pact.nonce.to_string(), "signers": signer_accts, "bond_refunded_yocto": bond.to_string()}),
        );
        events::game(
            "slash",
            json!({"season_id": season_id, "confessor": caller, "player": player, "slashed": slashed_list,
                   "total_yocto": slashed.to_string(), "payout_route": if evm.is_some() { "evm" } else { "near" },
                   "payout_evm": evm}),
        );
        self.return_open_lot(season_id);
        U128(slashed)
    }

    /// Desk result: on failure the attached NEAR came back to this contract; pay the player instead.
    #[private]
    pub fn on_desk_paid(&mut self, season_id: u64, player: AccountId, amount_yocto: U128) {
        let ok = env::promise_result_checked(0, 1024).is_ok();
        let s = self.season(season_id);
        s.payout_route = if ok { PayoutRoute::Evm } else { PayoutRoute::EvmFailedNear };
        let route = s.payout_route.as_str();
        if !ok {
            pay(&player, amount_yocto.0);
        }
        events::game(
            "payout_route",
            json!({"season_id": season_id, "route": route, "amount_yocto": amount_yocto.0.to_string()}),
        );
    }
}

impl Contract {
    fn pay_via_desk(&self, desk: &AccountId, season_id: u64, to: &str, amount: u128, player: &AccountId) {
        let left = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        let reserve = CALLBACK_GAS.as_gas() + RESERVE_GAS.as_gas();
        let gas = Gas::from_gas(left.saturating_sub(reserve).min(DESK_GAS_MAX.as_gas()));
        let args = json!({"season_id": season_id, "to": to, "amount_yocto": amount.to_string()}).to_string();
        let cb_args = json!({"season_id": season_id, "player": player, "amount_yocto": amount.to_string()}).to_string();
        let _ = Promise::new(desk.clone())
            .function_call("pay_evm".to_string(), args.into_bytes(), NearToken::from_yoctonear(amount), gas)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_desk_paid".to_string(),
                cb_args.into_bytes(),
                NearToken::from_yoctonear(0),
                CALLBACK_GAS,
            ));
    }
}
