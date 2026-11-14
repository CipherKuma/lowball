//! Pact and signature types, canonical message, and verification.

use near_sdk::borsh::{self, BorshSerialize};
use near_sdk::json_types::Base64VecU8;
use near_sdk::serde::{Deserialize, Deserializer, Serialize};
use near_sdk::{env, AccountId};

use crate::errors::*;
use crate::season::Season;

pub const PACT_PREFIX: &[u8] = b"LOWBALL-PACT-v1:";

/// Accept a JSON number or a decimal string (safe for ids beyond 2^53).
fn flex_u64<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    #[derive(Deserialize)]
    #[serde(crate = "near_sdk::serde", untagged)]
    enum N {
        Num(u64),
        Str(String),
    }
    match N::deserialize(d)? {
        N::Num(n) => Ok(n),
        N::Str(s) => s.parse::<u64>().map_err(near_sdk::serde::de::Error::custom),
    }
}

#[derive(BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Pact {
    #[serde(deserialize_with = "flex_u64")]
    pub season_id: u64,
    pub cap: u32,
    pub members: Vec<AccountId>,
    #[serde(deserialize_with = "flex_u64")]
    pub nonce: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PactSig {
    pub signer: AccountId,
    pub signature: Base64VecU8,
}

/// `b"LOWBALL-PACT-v1:" ++ borsh(pact)`
pub fn pact_message(pact: &Pact) -> Vec<u8> {
    let mut m = PACT_PREFIX.to_vec();
    m.extend(borsh::to_vec(pact).unwrap_or_else(|_| env::panic_str(E_BAD_ARGS)));
    m
}

/// Validate a confession against the season. Returns the verified signer indexes (in signature
/// order) and the caller index. Check order is part of the contract:
/// E_CLOSED, E_ALREADY_CONFESSED, E_NOT_BUYER, E_NO_LENIENCY, E_SEASON_MISMATCH, E_NOT_MEMBER
/// (members), E_DUP_SIGNER (members), E_NOT_MEMBER/E_DUP_SIGNER (signatures), E_BAD_SIG, E_TOO_FEW.
pub fn verify_confession(
    s: &Season,
    season_id: u64,
    caller: &AccountId,
    pact: &Pact,
    sigs: &[PactSig],
) -> (u8, Vec<u8>) {
    use crate::season::Status;
    match s.status {
        Status::Closed => env::panic_str(E_CLOSED),
        Status::Confessed => env::panic_str(E_ALREADY_CONFESSED),
        Status::Open => {}
    }
    let caller_idx = s.buyer_idx(caller);
    ensure(s.window_live(), E_NO_LENIENCY);
    ensure(pact.season_id == season_id, E_SEASON_MISMATCH);
    ensure(pact.members.iter().all(|m| s.idx(m).is_some()), E_NOT_MEMBER);
    ensure(pact.members.contains(caller), E_NOT_MEMBER);
    for (i, m) in pact.members.iter().enumerate() {
        ensure(!pact.members[..i].contains(m), E_DUP_SIGNER);
    }
    let msg = pact_message(pact);
    let mut signers: Vec<u8> = Vec::with_capacity(sigs.len());
    for ps in sigs {
        let idx = s.idx(&ps.signer).unwrap_or_else(|| env::panic_str(E_NOT_MEMBER));
        ensure(pact.members.contains(&ps.signer), E_NOT_MEMBER);
        ensure(!signers.contains(&idx), E_DUP_SIGNER);
        let sig: [u8; 64] = ps.signature.0.as_slice().try_into().unwrap_or_else(|_| env::panic_str(E_BAD_SIG));
        ensure(env::ed25519_verify(&sig, &msg, &s.buyers[idx as usize].pk), E_BAD_SIG);
        signers.push(idx);
    }
    ensure(signers.len() >= 2 && signers.contains(&caller_idx), E_TOO_FEW);
    (caller_idx, signers)
}
