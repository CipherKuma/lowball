use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

// Independent oracle: viem 2.21 `serializeTransaction` + @noble/curves secp256k1 (RFC6979, low-s),
// test key 0x1111...1122, nonce 7, 0.0002 ETH to the Hardhat #1 address, Sepolia.
const TO: &str = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const UNSIGNED: &str = "02f183aa36a70784773594008506fc23ac008252089470997970c51812dc3a010c7d01b50e0d17dc79c886b5e620f4800080c0";
const DIGEST: &str = "59ed8ee682c274f15638b93bff92c64b8305473b241cafe2a68375220ed849a9";
const SIGNED: &str = "02f87483aa36a70784773594008506fc23ac008252089470997970c51812dc3a010c7d01b50e0d17dc79c886b5e620f4800080c080a022dc9a7c747ca303b3b53cb0bdd0b7abdb270091b06e3985ba7533556441c195a04030f0dce7d9c05d109ddf00a6d5fdec41c19851dcdf5cd525de200ff39dd608";
const R: &str = "22dc9a7c747ca303b3b53cb0bdd0b7abdb270091b06e3985ba7533556441c195";
const S: &str = "4030f0dce7d9c05d109ddf00a6d5fdec41c19851dcdf5cd525de200ff39dd608";
const PUB64: &str = "372e17b2c6239bd83517433b83aee90b84ab9c9ab21a40886e54bcbe6afbcc10b04d7fe4efd9668fac0ac7d3d37275ca2c1c3628d9f74b1759f306baec965580";
const ADDR: &str = "0x7d931fd3f5a12c18Cd77f9Cb90ff58E677dF9479";

fn acct(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(pred: &str, deposit: u128, gas_tgas: u64) -> near_sdk::VMContext {
    VMContextBuilder::new()
        .current_account_id(acct("desk.lowball-ck.testnet"))
        .predecessor_account_id(acct(pred))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .prepaid_gas(Gas::from_tgas(gas_tgas))
        .build()
}

fn desk() -> Desk {
    testing_env!(ctx("house.testnet", 0, 300));
    let mut d = Desk::new(acct("house.testnet"), acct("lowball-ck.testnet"), acct("v1.signer-prod.testnet"));
    d.prepare(7, U128(30_000_000_000), U128(2_000_000_000));
    d
}

const NEAR_0_2: u128 = 200_000_000_000_000_000_000_000;

fn pay(d: &mut Desk, season: u64, to: &str, yocto: u128) -> Payout {
    testing_env!(ctx("lowball-ck.testnet", yocto, 200));
    d.pay_evm(season, to.to_string(), U128(yocto))
}

fn sig_json(r: &str, s: &str, rec: u8) -> serde_json::Value {
    // MPC big_r is the 33-byte compressed point; only x (bytes 1..33) is r.
    serde_json::json!({"scheme": "Secp256k1", "big_r": {"affine_point": format!("02{r}")}, "s": {"scalar": s}, "recovery_id": rec})
}

fn callback(d: &mut Desk, season: u64, res: Result<serde_json::Value, PromiseError>) {
    testing_env!(ctx("desk.lowball-ck.testnet", 0, 100));
    d.on_signed(season, res);
}

#[test]
fn tx_matches_viem_oracle() {
    let t = Transfer {
        chain_id: SEPOLIA_CHAIN_ID,
        nonce: 7,
        max_priority_fee_per_gas: 2_000_000_000,
        max_fee_per_gas: 30_000_000_000,
        gas_limit: 21_000,
        to: parse_address(TO).unwrap(),
        value_wei: 200_000_000_000_000,
    };
    assert_eq!(hex::encode(t.signing_preimage()), UNSIGNED);
    assert_eq!(hex::encode(env::keccak256_array(&t.signing_preimage())), DIGEST);
    let (r, s): ([u8; 32], [u8; 32]) = (hex::decode(R).unwrap().try_into().unwrap(), hex::decode(S).unwrap().try_into().unwrap());
    assert_eq!(hex::encode(t.signed(0, &r, &s)), SIGNED);
}

#[test]
fn address_derivation_and_checksum() {
    let pk = hex::decode(PUB64).unwrap();
    assert_eq!(eip55(&eth_address_from_pubkey(&pk)), ADDR);
    // EIP-55 reference vectors.
    for a in ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359"] {
        assert_eq!(eip55(&parse_address(a).unwrap()), a);
    }
}

#[test]
fn ecrecover_recovers_the_oracle_key() {
    let mut rs = [0u8; 64];
    rs[..32].copy_from_slice(&hex::decode(R).unwrap());
    rs[32..].copy_from_slice(&hex::decode(S).unwrap());
    let pk = env::ecrecover(&hex::decode(DIGEST).unwrap(), &rs, 0, false).expect("recovers");
    assert_eq!(eip55(&eth_address_from_pubkey(&pk)), ADDR);
}

#[test]
fn pay_evm_builds_the_expected_request() {
    let mut d = desk();
    let p = pay(&mut d, 3, TO, NEAR_0_2);
    assert_eq!(p.status, PayoutStatus::Pending);
    assert_eq!(p.amount_wei.0, 200_000_000_000_000); // 0.2 NEAR -> 0.0002 ETH
    assert_eq!(p.nonce, 7);
    assert_eq!(p.unsigned_tx, format!("0x{UNSIGNED}"));
    assert_eq!(p.digest, format!("0x{DIGEST}"));
    assert_eq!(d.get_config().next_nonce, 8);
    assert!(get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains("payout_requested")));
    assert_eq!(d.get_payout(3).unwrap().status, PayoutStatus::Pending);
    assert!(d.get_payout(4).is_none());
}

#[test]
fn rejections_use_stable_codes() {
    let mut d = desk();
    let try_pay = |d: &mut Desk, pred: &str, dep: u128, gas: u64, to: &str, amt: u128, season: u64| {
        testing_env!(ctx(pred, dep, gas));
        let to = to.to_string();
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| d.pay_evm(season, to, U128(amt))))
            .map(|_| "ok".to_string())
            .unwrap_or_else(|e| e.downcast_ref::<String>().cloned().unwrap_or_else(|| "panic".into()))
    };
    let err = |s: String| s;
    assert!(err(try_pay(&mut d, "evil.testnet", NEAR_0_2, 200, TO, NEAR_0_2, 1)).contains("E_NOT_GAME"));
    assert!(err(try_pay(&mut d, "lowball-ck.testnet", NEAR_0_2 - 1, 200, TO, NEAR_0_2, 1)).contains("E_DEPOSIT_MISMATCH"));
    assert!(err(try_pay(&mut d, "lowball-ck.testnet", NEAR_0_2, 60, TO, NEAR_0_2, 1)).contains("E_GAS_TOO_LOW"));
    assert!(err(try_pay(&mut d, "lowball-ck.testnet", NEAR_0_2, 200, "0x1234", NEAR_0_2, 1)).contains("E_BAD_ADDRESS"));
    assert!(err(try_pay(&mut d, "lowball-ck.testnet", NEAR_0_2, 200, &TO.replace("0x", "0z"), NEAR_0_2, 1)).contains("E_BAD_ADDRESS"));
    assert!(err(try_pay(&mut d, "lowball-ck.testnet", 5, 200, TO, 5, 1)).contains("E_AMOUNT_ZERO")); // dust rounds to 0 wei
    assert_eq!(try_pay(&mut d, "lowball-ck.testnet", NEAR_0_2, 200, TO, NEAR_0_2, 1), "ok");
    assert!(err(try_pay(&mut d, "lowball-ck.testnet", NEAR_0_2, 200, TO, NEAR_0_2, 1)).contains("E_ALREADY_PAID"));
    // Rejected calls never consumed a nonce.
    assert_eq!(d.get_config().next_nonce, 8);
}

#[test]
#[should_panic(expected = "E_NOT_OWNER")]
fn only_owner_prepares() {
    let mut d = desk();
    testing_env!(ctx("lowball-ck.testnet", 0, 50));
    d.prepare(0, U128(1), U128(1));
}

#[test]
fn signed_callback_without_derived_address_is_unverified() {
    let mut d = desk();
    pay(&mut d, 3, TO, NEAR_0_2);
    callback(&mut d, 3, Ok(sig_json(R, S, 0)));
    let p = d.get_payout(3).unwrap();
    assert_eq!(p.status, PayoutStatus::Signed);
    assert!(!p.verified);
    assert_eq!(p.big_r.unwrap(), format!("0x02{R}"));
    assert_eq!(p.s.unwrap(), format!("0x{S}"));
    assert_eq!(p.recovery_id, Some(0));
}

#[test]
fn signed_callback_verifies_against_derived_address() {
    let mut d = desk();
    d.derived_address = Some(ADDR.to_string());
    pay(&mut d, 3, TO, NEAR_0_2);
    callback(&mut d, 3, Ok(sig_json(R, S, 0)));
    let p = d.get_payout(3).unwrap();
    assert_eq!((p.status, p.verified), (PayoutStatus::Signed, true));
}

#[test]
fn wrong_signer_fails_closed_and_nonce_is_reused() {
    let mut d = desk();
    d.derived_address = Some("0x70997970C51812dc3A010C7d01b50e0d17dc79C8".to_string());
    pay(&mut d, 3, TO, NEAR_0_2);
    callback(&mut d, 3, Ok(sig_json(R, S, 0)));
    let p = d.get_payout(3).unwrap();
    assert_eq!(p.status, PayoutStatus::Failed);
    assert_eq!(p.error.as_deref(), Some("E_SIG_MISMATCH"));
    assert_eq!(d.get_config().next_nonce, 7);
}

#[test]
fn mpc_timeout_fails_then_owner_can_retry() {
    let mut d = desk();
    pay(&mut d, 3, TO, NEAR_0_2);
    callback(&mut d, 3, Err(PromiseError::Failed));
    assert_eq!(d.get_payout(3).unwrap().error.as_deref(), Some("E_SIGN_FAILED"));
    // Failed payouts do not block a duplicate game call from being refused...
    testing_env!(ctx("lowball-ck.testnet", NEAR_0_2, 200));
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| d.pay_evm(3, TO.into(), U128(NEAR_0_2)))).is_err());
    // ...but the owner can retry it, with the same nonce, and only if it Failed.
    testing_env!(ctx("house.testnet", 0, 200));
    let p = d.retry_payout(3);
    assert_eq!((p.status, p.nonce), (PayoutStatus::Pending, 7));
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| d.retry_payout(3))).is_err());
}

#[test]
fn malformed_signature_is_a_failure_not_a_panic() {
    let mut d = desk();
    pay(&mut d, 3, TO, NEAR_0_2);
    callback(&mut d, 3, Ok(serde_json::json!({"scheme": "Ed25519", "signature": [1, 2, 3]})));
    assert_eq!(d.get_payout(3).unwrap().error.as_deref(), Some("E_SIG_FORMAT"));
}

#[test]
fn late_callback_does_not_overwrite_a_signed_payout() {
    let mut d = desk();
    pay(&mut d, 3, TO, NEAR_0_2);
    callback(&mut d, 3, Ok(sig_json(R, S, 0)));
    callback(&mut d, 3, Err(PromiseError::Failed));
    assert_eq!(d.get_payout(3).unwrap().status, PayoutStatus::Signed);
}

#[test]
fn derived_key_callback_sets_the_checksum_address() {
    let mut d = desk();
    let key = format!("secp256k1:{}", near_sdk::bs58::encode(hex::decode(PUB64).unwrap()).into_string());
    testing_env!(ctx("desk.lowball-ck.testnet", 0, 50));
    assert_eq!(d.on_derived_key(Ok(key)).unwrap(), ADDR);
    assert_eq!(d.get_derived_address().unwrap(), ADDR);
}
