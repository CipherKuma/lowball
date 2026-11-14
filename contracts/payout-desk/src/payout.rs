//! Stored payout record, config view, NEP-297 events and MPC response parsing.

use near_sdk::json_types::U128;
use near_sdk::{env, near, serde_json, AccountId};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum PayoutStatus {
    /// MPC signature requested, not yet returned.
    Pending,
    /// Signature stored; the relayer can broadcast.
    Signed,
    /// Signing failed or the signature did not match the desk key; `retry_payout` re-requests.
    Failed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Payout {
    pub season_id: u64,
    pub status: PayoutStatus,
    /// Lower-case 0x address of the Sepolia recipient.
    pub to: String,
    pub amount_yocto: U128,
    pub amount_wei: U128,
    pub chain_id: u64,
    pub nonce: u64,
    pub max_fee_per_gas: U128,
    pub max_priority_fee_per_gas: U128,
    pub gas_limit: u64,
    /// keccak256 of `unsigned_tx` (the 32 bytes the MPC signed).
    pub digest: String,
    /// `0x02 || rlp([chainId, nonce, maxPriorityFee, maxFee, gasLimit, to, value, data, accessList])`.
    pub unsigned_tx: String,
    /// 33-byte compressed big-R from the MPC response; r = bytes 1..33.
    pub big_r: Option<String>,
    pub s: Option<String>,
    pub recovery_id: Option<u8>,
    /// True when `ecrecover` on chain matched the desk's derived address.
    pub verified: bool,
    pub requested_block: u64,
    pub signed_block: Option<u64>,
    pub error: Option<String>,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub game: AccountId,
    pub signer: AccountId,
    pub path: String,
    pub chain_id: u64,
    pub next_nonce: u64,
    pub max_fee_per_gas: U128,
    pub max_priority_fee_per_gas: U128,
    pub gas_limit: u64,
    pub rate_num: U128,
    pub rate_den: U128,
    pub derived_address: Option<String>,
}

pub struct Sig {
    pub big_r: [u8; 33],
    pub s: [u8; 32],
    pub recovery_id: u8,
}

fn hex_field<const N: usize>(v: &serde_json::Value, outer: &str, inner: &str) -> Result<[u8; N], String> {
    let s = v.get(outer).and_then(|o| o.get(inner)).and_then(|x| x.as_str()).ok_or("E_SIG_FORMAT")?;
    let mut out = [0u8; N];
    hex::decode_to_slice(s.trim_start_matches("0x"), &mut out).map_err(|_| "E_SIG_FORMAT".to_string())?;
    Ok(out)
}

/// MPC `SignatureResponse::Secp256k1` JSON: `{scheme, big_r:{affine_point}, s:{scalar}, recovery_id}`.
pub fn parse_signature(v: &serde_json::Value) -> Result<Sig, String> {
    let recovery_id = v.get("recovery_id").and_then(|x| x.as_u64()).ok_or("E_SIG_FORMAT")?;
    if recovery_id > 3 {
        return Err("E_SIG_FORMAT".to_string());
    }
    Ok(Sig {
        big_r: hex_field::<33>(v, "big_r", "affine_point")?,
        s: hex_field::<32>(v, "s", "scalar")?,
        recovery_id: recovery_id as u8,
    })
}

/// NEP-297 event: `EVENT_JSON:{"standard":"lowball-desk","version":"1.0.0","event":...,"data":[...]}`.
pub fn emit(event: &str, p: &Payout) {
    let data = serde_json::json!({
        "season_id": p.season_id, "to": p.to, "amount_yocto": p.amount_yocto, "amount_wei": p.amount_wei,
        "nonce": p.nonce, "status": p.status, "error": p.error, "verified": p.verified,
    });
    let e = serde_json::json!({"standard": "lowball-desk", "version": "1.0.0", "event": event, "data": [data]});
    env::log_str(&format!("EVENT_JSON:{e}"));
}
