//! Lowball payout desk. The game contract hands it slashed NEAR plus an Ethereum address; the desk
//! builds an EIP-1559 Sepolia transfer from its own MPC-derived key, asks the NEAR MPC signer to sign
//! it (Chain Signatures) and stores the signature. An untrusted relayer assembles and broadcasts.
//!
//! The desk never signs anything but a plain ETH transfer it built itself: there is no method that
//! takes a caller-supplied digest.

mod address;
mod payout;
mod rlp;
mod tx;

pub use address::{eip55, eth_address_from_pubkey};
pub use payout::{ConfigView, Payout, PayoutStatus};
pub use tx::{parse_address, Transfer, PLAIN_TRANSFER_GAS, SEPOLIA_CHAIN_ID};

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, serde_json, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};

pub const DEFAULT_PATH: &str = "lowball-desk-v1";
/// Minimum prepaid gas on `pay_evm`: 50 (signer) + 20 (callback) + own execution + headroom.
pub const MIN_PREPAID_TGAS: u64 = 90;
pub const MIN_GAS_LIMIT: u64 = 21_000;
pub const MAX_GAS_LIMIT: u64 = 1_000_000;
const SIGN_GAS: Gas = Gas::from_tgas(50);
const CALLBACK_GAS: Gas = Gas::from_tgas(20);
const KEY_VIEW_GAS: Gas = Gas::from_tgas(15);
const KEY_CB_GAS: Gas = Gas::from_tgas(10);

fn ensure(cond: bool, code: &str) {
    if !cond {
        env::panic_str(code);
    }
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Desk {
    owner: AccountId,
    game: AccountId,
    signer: AccountId,
    path: String,
    chain_id: u64,
    next_nonce: u64,
    max_fee_per_gas: u128,
    max_priority_fee_per_gas: u128,
    gas_limit: u64,
    /// wei = yocto * rate_num / rate_den. Default 1 / 1e9: 0.2 NEAR -> 0.0002 ETH.
    rate_num: u128,
    rate_den: u128,
    derived_address: Option<String>,
    payouts: LookupMap<u64, Payout>,
}

#[near]
impl Desk {
    #[init]
    pub fn new(owner: AccountId, game: AccountId, signer: AccountId) -> Self {
        Self {
            owner,
            game,
            signer,
            path: DEFAULT_PATH.to_string(),
            chain_id: SEPOLIA_CHAIN_ID,
            next_nonce: 0,
            max_fee_per_gas: 30_000_000_000,
            max_priority_fee_per_gas: 2_000_000_000,
            gas_limit: PLAIN_TRANSFER_GAS,
            rate_num: 1,
            rate_den: 1_000_000_000,
            derived_address: None,
            payouts: LookupMap::new(b"p"),
        }
    }

    // ---- house configuration (owner only) -------------------------------------------------

    /// Nonce and fee fields for the next payouts. The relayer calls this with the desk address's
    /// pending transaction count and current fees whenever it is idle (no `Pending` payout).
    pub fn prepare(&mut self, next_nonce: u64, max_fee_per_gas: U128, max_priority_fee_per_gas: U128) {
        self.only_owner();
        ensure(max_priority_fee_per_gas.0 <= max_fee_per_gas.0 && max_fee_per_gas.0 > 0, "E_BAD_FEES");
        self.next_nonce = next_nonce;
        self.max_fee_per_gas = max_fee_per_gas.0;
        self.max_priority_fee_per_gas = max_priority_fee_per_gas.0;
    }

    /// Gas limit signed into every later payout. Sepolia charges ~207k gas to send ETH to an address
    /// that never existed (21k to an existing one); unused gas is refunded, so a high limit is free.
    /// Applies to `pay_evm` and `retry_payout` requests made after this call, never to signed ones.
    pub fn set_gas_limit(&mut self, gas_limit: u64) {
        self.only_owner();
        ensure((MIN_GAS_LIMIT..=MAX_GAS_LIMIT).contains(&gas_limit), "E_BAD_GAS_LIMIT");
        self.gas_limit = gas_limit;
    }

    pub fn set_rate(&mut self, rate_num: U128, rate_den: U128) {
        self.only_owner();
        ensure(rate_num.0 > 0 && rate_den.0 > 0, "E_BAD_RATE");
        self.rate_num = rate_num.0;
        self.rate_den = rate_den.0;
    }

    /// Asks the MPC signer (view call) for this desk's derived key and stores its Ethereum address.
    pub fn refresh_derived_address(&mut self) -> Promise {
        self.only_owner();
        let args = serde_json::json!({
            "path": self.path, "predecessor": env::current_account_id(), "domain_id": 0
        });
        Promise::new(self.signer.clone())
            .function_call("derived_public_key", args.to_string().into_bytes(), NearToken::from_yoctonear(0), KEY_VIEW_GAS)
            .then(Self::ext(env::current_account_id()).with_static_gas(KEY_CB_GAS).on_derived_key())
    }

    #[private]
    pub fn on_derived_key(&mut self, #[callback_result] key: Result<String, PromiseError>) -> Option<String> {
        let key = key.unwrap_or_else(|_| env::panic_str("E_SIGNER_KEY_VIEW"));
        let b58 = key.strip_prefix("secp256k1:").unwrap_or_else(|| env::panic_str("E_KEY_FORMAT"));
        let raw = near_sdk::bs58::decode(b58).into_vec().unwrap_or_else(|_| env::panic_str("E_KEY_FORMAT"));
        ensure(raw.len() == 64, "E_KEY_FORMAT");
        let addr = eip55(&eth_address_from_pubkey(&raw));
        self.derived_address = Some(addr.clone());
        Some(addr)
    }

    // ---- payout ---------------------------------------------------------------------------

    /// Game contract only. Attached deposit must equal `amount_yocto` (the slashed NEAR, kept by the
    /// desk as the house treasury). Builds the Sepolia transfer and requests the MPC signature; the
    /// signature arrives in `on_signed` (seconds later). Returns the pending record.
    #[payable]
    pub fn pay_evm(&mut self, season_id: u64, to: String, amount_yocto: U128) -> Payout {
        ensure(env::predecessor_account_id() == self.game, "E_NOT_GAME");
        ensure(env::attached_deposit().as_yoctonear() == amount_yocto.0, "E_DEPOSIT_MISMATCH");
        ensure(env::prepaid_gas() >= Gas::from_tgas(MIN_PREPAID_TGAS), "E_GAS_TOO_LOW");
        ensure(!self.payouts.contains_key(&season_id), "E_ALREADY_PAID");
        self.request(season_id, &to, amount_yocto.0)
    }

    /// Owner only: re-request a payout whose signing failed (MPC timeout, address mismatch).
    pub fn retry_payout(&mut self, season_id: u64) -> Payout {
        self.only_owner();
        let p = self.payouts.get(&season_id).unwrap_or_else(|| env::panic_str("E_NO_PAYOUT"));
        ensure(p.status == PayoutStatus::Failed, "E_NOT_FAILED");
        let (to, amount) = (p.to.clone(), p.amount_yocto.0);
        self.request(season_id, &to, amount)
    }

    #[private]
    pub fn on_signed(&mut self, season_id: u64, #[callback_result] res: Result<serde_json::Value, PromiseError>) {
        let mut p = self.payouts.get(&season_id).cloned().unwrap_or_else(|| env::panic_str("E_NO_PAYOUT"));
        if p.status != PayoutStatus::Pending {
            return;
        }
        let outcome = res
            .map_err(|_| "E_SIGN_FAILED".to_string())
            .and_then(|v| payout::parse_signature(&v))
            .and_then(|sig| self.check_signature(&p, sig));
        match outcome {
            Ok((sig, verified)) => {
                p.status = PayoutStatus::Signed;
                p.big_r = Some(format!("0x{}", hex::encode(sig.big_r)));
                p.s = Some(format!("0x{}", hex::encode(sig.s)));
                p.recovery_id = Some(sig.recovery_id);
                p.verified = verified;
                p.signed_block = Some(env::block_height());
                payout::emit("payout_signed", &p);
            }
            Err(code) => {
                p.status = PayoutStatus::Failed;
                p.error = Some(code);
                if p.nonce + 1 == self.next_nonce {
                    self.next_nonce = p.nonce; // nothing later was handed out: reuse the nonce
                }
                payout::emit("payout_failed", &p);
            }
        }
        self.payouts.insert(season_id, p);
    }

    // ---- views ----------------------------------------------------------------------------

    pub fn get_payout(&self, season_id: u64) -> Option<Payout> {
        self.payouts.get(&season_id).cloned()
    }

    pub fn get_derived_address(&self) -> Option<String> {
        self.derived_address.clone()
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            game: self.game.clone(),
            signer: self.signer.clone(),
            path: self.path.clone(),
            chain_id: self.chain_id,
            next_nonce: self.next_nonce,
            max_fee_per_gas: U128(self.max_fee_per_gas),
            max_priority_fee_per_gas: U128(self.max_priority_fee_per_gas),
            gas_limit: self.gas_limit,
            rate_num: U128(self.rate_num),
            rate_den: U128(self.rate_den),
            derived_address: self.derived_address.clone(),
        }
    }
}

impl Desk {
    fn only_owner(&self) {
        ensure(env::predecessor_account_id() == self.owner, "E_NOT_OWNER");
    }

    fn request(&mut self, season_id: u64, to: &str, amount_yocto: u128) -> Payout {
        let to_bytes = parse_address(to).unwrap_or_else(|| env::panic_str("E_BAD_ADDRESS"));
        let value_wei = amount_yocto
            .checked_mul(self.rate_num)
            .unwrap_or_else(|| env::panic_str("E_OVERFLOW"))
            / self.rate_den;
        ensure(value_wei > 0, "E_AMOUNT_ZERO");
        let transfer = Transfer {
            chain_id: self.chain_id,
            nonce: self.next_nonce,
            max_priority_fee_per_gas: self.max_priority_fee_per_gas,
            max_fee_per_gas: self.max_fee_per_gas,
            gas_limit: self.gas_limit,
            to: to_bytes,
            value_wei,
        };
        let preimage = transfer.signing_preimage();
        let digest = env::keccak256_array(&preimage);
        self.next_nonce += 1;

        let p = Payout {
            season_id,
            status: PayoutStatus::Pending,
            to: format!("0x{}", hex::encode(to_bytes)),
            amount_yocto: U128(amount_yocto),
            amount_wei: U128(value_wei),
            chain_id: transfer.chain_id,
            nonce: transfer.nonce,
            max_fee_per_gas: U128(transfer.max_fee_per_gas),
            max_priority_fee_per_gas: U128(transfer.max_priority_fee_per_gas),
            gas_limit: transfer.gas_limit,
            digest: format!("0x{}", hex::encode(digest)),
            unsigned_tx: format!("0x{}", hex::encode(&preimage)),
            big_r: None,
            s: None,
            recovery_id: None,
            verified: false,
            requested_block: env::block_height(),
            signed_block: None,
            error: None,
        };
        self.payouts.insert(season_id, p.clone());
        payout::emit("payout_requested", &p);

        let args = serde_json::json!({
            "request": {"path": self.path, "payload_v2": {"Ecdsa": hex::encode(digest)}, "domain_id": 0}
        });
        let _ = Promise::new(self.signer.clone())
            .function_call("sign", args.to_string().into_bytes(), NearToken::from_yoctonear(1), SIGN_GAS)
            .then(Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_signed(season_id));
        p
    }

    /// On-chain check that the MPC signature recovers to this desk's own address. Skipped (verified =
    /// false) until `refresh_derived_address` has run; the relayer re-verifies before broadcasting.
    fn check_signature(&self, p: &Payout, sig: payout::Sig) -> Result<(payout::Sig, bool), String> {
        let Some(addr) = &self.derived_address else { return Ok((sig, false)) };
        let digest = hex::decode(&p.digest[2..]).map_err(|_| "E_STATE".to_string())?;
        let mut rs = [0u8; 64];
        rs[..32].copy_from_slice(&sig.big_r[1..33]);
        rs[32..].copy_from_slice(&sig.s);
        let pk = env::ecrecover(&digest, &rs, sig.recovery_id, false).ok_or("E_SIG_UNRECOVERABLE")?;
        let got = eip55(&eth_address_from_pubkey(&pk));
        if &got == addr { Ok((sig, true)) } else { Err("E_SIG_MISMATCH".to_string()) }
    }
}

#[cfg(test)]
mod unit_tests;
