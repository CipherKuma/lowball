//! Mock payout desk used only by the sandbox tests of the Lowball game contract.
//! Same call shape as the real desk: `pay_evm(season_id, to, amount_yocto)` payable.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, PanicOnDefault};

#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct Payout {
    pub season_id: u64,
    pub to: String,
    pub amount_yocto: U128,
    pub deposit_yocto: U128,
    pub caller: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockDesk {
    fail: bool,
    payouts: LookupMap<u64, Payout>,
}

#[near]
impl MockDesk {
    #[init]
    pub fn new() -> Self {
        Self { fail: false, payouts: LookupMap::new(b"p") }
    }

    pub fn set_fail(&mut self, fail: bool) {
        self.fail = fail;
    }

    #[payable]
    pub fn pay_evm(&mut self, season_id: u64, to: String, amount_yocto: U128) {
        if self.fail {
            env::panic_str("MOCK_DESK_FAIL");
        }
        let dep = env::attached_deposit().as_yoctonear();
        assert_eq!(dep, amount_yocto.0, "deposit must equal amount_yocto");
        self.payouts.insert(
            season_id,
            Payout {
                season_id,
                to,
                amount_yocto,
                deposit_yocto: U128(dep),
                caller: env::predecessor_account_id().to_string(),
            },
        );
    }

    pub fn get_payout(&self, season_id: u64) -> Option<Payout> {
        self.payouts.get(&season_id).cloned()
    }
}
