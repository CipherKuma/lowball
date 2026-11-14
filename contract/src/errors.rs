//! Stable error codes. Every failure is `env::panic_str(CODE)`; clients match on the string.

use near_sdk::env;

pub const E_NOT_HOUSE: &str = "E_NOT_HOUSE";
pub const E_BAD_ARGS: &str = "E_BAD_ARGS";
pub const E_NO_SEASON: &str = "E_NO_SEASON";
pub const E_NO_KEY: &str = "E_NO_KEY";
pub const E_BAD_KEY: &str = "E_BAD_KEY";
pub const E_NOT_BUYER: &str = "E_NOT_BUYER";
pub const E_NOT_PLAYER: &str = "E_NOT_PLAYER";
pub const E_BAD_DEPOSIT: &str = "E_BAD_DEPOSIT";
pub const E_BOND_POSTED: &str = "E_BOND_POSTED";
pub const E_NO_BOND: &str = "E_NO_BOND";
pub const E_BONDS_MISSING: &str = "E_BONDS_MISSING";
pub const E_SEASON_OVER: &str = "E_SEASON_OVER";
pub const E_LOT_OPEN: &str = "E_LOT_OPEN";
pub const E_NO_LOT: &str = "E_NO_LOT";
pub const E_PAST_DAYS: &str = "E_PAST_DAYS";
pub const E_ALREADY_COMMITTED: &str = "E_ALREADY_COMMITTED";
pub const E_NO_COMMIT: &str = "E_NO_COMMIT";
pub const E_ALREADY_REVEALED: &str = "E_ALREADY_REVEALED";
pub const E_BAD_REVEAL: &str = "E_BAD_REVEAL";
pub const E_NOT_READY: &str = "E_NOT_READY";
pub const E_NOT_FINISHED: &str = "E_NOT_FINISHED";
pub const E_NO_DAY: &str = "E_NO_DAY";
pub const E_NO_LENIENCY: &str = "E_NO_LENIENCY";
pub const E_SEASON_MISMATCH: &str = "E_SEASON_MISMATCH";
pub const E_NOT_MEMBER: &str = "E_NOT_MEMBER";
pub const E_DUP_SIGNER: &str = "E_DUP_SIGNER";
pub const E_BAD_SIG: &str = "E_BAD_SIG";
pub const E_TOO_FEW: &str = "E_TOO_FEW";
pub const E_ALREADY_CONFESSED: &str = "E_ALREADY_CONFESSED";
pub const E_CLOSED: &str = "E_CLOSED";
pub const E_SEASON_OPEN: &str = "E_SEASON_OPEN";
pub const E_SLASHED: &str = "E_SLASHED";
pub const E_ALREADY_WITHDRAWN: &str = "E_ALREADY_WITHDRAWN";
pub const E_LENIENCY_OPEN: &str = "E_LENIENCY_OPEN";
pub const E_BAD_EVM: &str = "E_BAD_EVM";
pub const E_NO_TOKEN: &str = "E_NO_TOKEN";
pub const E_NOT_TOKEN_OWNER: &str = "E_NOT_TOKEN_OWNER";
pub const E_MT_PARTIAL: &str = "E_MT_PARTIAL";
pub const E_NEED_1_YOCTO: &str = "E_NEED_1_YOCTO";
pub const E_SELF_TRANSFER: &str = "E_SELF_TRANSFER";
pub const E_NOT_CONTRACT: &str = "E_NOT_CONTRACT";

/// Panic unless `cond`, with a stable error code as the panic string.
#[inline]
pub fn ensure(cond: bool, code: &str) {
    if !cond {
        env::panic_str(code)
    }
}
