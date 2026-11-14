#![allow(unused_must_use)]
//! Desk + mock MPC signer in a live sandbox: derive address, pay, verify, failure and retry paths.
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{network::Sandbox, Account, Contract, Worker};
use serde_json::{json, Value};

const TO: &str = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const KEY: &str = "1111111111111111111111111111111111111111111111111111111111111122"; // oracle key
const OTHER: &str = "2222222222222222222222222222222222222222222222222222222222222233";
const ADDR: &str = "0x7d931fd3f5a12c18Cd77f9Cb90ff58E677dF9479";
const NEAR_0_2: u128 = 200_000_000_000_000_000_000_000;

struct Env {
    _w: Worker<Sandbox>,
    desk: Contract,
    signer: Contract,
    house: Account,
    game: Account,
    stranger: Account,
}

async fn setup() -> anyhow::Result<Env> {
    let w = near_workspaces::sandbox().await?;
    let root = w.root_account()?;
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/near/");
    let mk = |n: &'static str| {
        let root = root.clone();
        async move { Ok::<_, anyhow::Error>(root.create_subaccount(n).initial_balance(NearToken::from_near(20)).transact().await?.into_result()?) }
    };
    let signer = mk("signer").await?.deploy(&std::fs::read(format!("{dir}mock_signer.wasm"))?).await?.into_result()?;
    signer.call("new").args_json(json!({"secret_hex": KEY, "other_secret_hex": OTHER})).transact().await?.into_result()?;
    let (house, game, stranger) = (mk("house").await?, mk("game").await?, mk("stranger").await?);
    let desk = mk("desk").await?.deploy(&std::fs::read(format!("{dir}payout_desk.wasm"))?).await?.into_result()?;
    desk.call("new").args_json(json!({"owner": house.id(), "game": game.id(), "signer": signer.id()})).transact().await?.into_result()?;
    Ok(Env { _w: w, desk, signer, house, game, stranger })
}

impl Env {
    async fn pay(&self, from: &Account, season: u64, to: &str, yocto: u128, deposit: u128, tgas: u64) -> ExecutionFinalResult {
        from.call(self.desk.id(), "pay_evm")
            .args_json(json!({"season_id": season, "to": to, "amount_yocto": yocto.to_string()}))
            .deposit(NearToken::from_yoctonear(deposit)).gas(Gas::from_tgas(tgas)).transact().await.unwrap()
    }
    async fn payout(&self, season: u64) -> Value {
        self.desk.view("get_payout").args_json(json!({"season_id": season})).await.unwrap().json().unwrap()
    }
    async fn owner(&self, method: &str, args: Value) -> ExecutionFinalResult {
        self.house.call(self.desk.id(), method).args_json(args).gas(Gas::from_tgas(100)).transact().await.unwrap()
    }
}

fn failure(r: &ExecutionFinalResult) -> String {
    format!("{:?}", r.clone().into_result().err())
}

#[tokio::test]
async fn derive_pay_verify_and_events() -> anyhow::Result<()> {
    let e = setup().await?;
    assert!(e.owner("refresh_derived_address", json!({})).await.is_success());
    let addr: Option<String> = e.desk.view("get_derived_address").await?.json()?;
    assert_eq!(addr.as_deref(), Some(ADDR), "desk derives the same address as viem/noble");

    assert!(e.owner("prepare", json!({"next_nonce": 7, "max_fee_per_gas": "30000000000", "max_priority_fee_per_gas": "2000000000"})).await.is_success());
    let before = e.desk.view_account().await?.balance;
    let r = e.pay(&e.game, 5, TO, NEAR_0_2, NEAR_0_2, 200).await;
    assert!(r.is_success(), "{:?}", r.failures());
    let events: Vec<String> = r.logs().iter().filter(|l| l.starts_with("EVENT_JSON:")).map(|s| s.to_string()).collect();
    assert!(events.iter().any(|l| l.contains("payout_requested")), "{events:?}");

    let p = e.payout(5).await;
    assert_eq!(p["status"], "Signed", "{p}");
    assert_eq!(p["verified"], true, "on-chain ecrecover matched the derived address");
    assert_eq!(p["nonce"], 7);
    assert_eq!(p["amount_wei"], "200000000000000");
    assert_eq!(p["unsigned_tx"], "0x02f183aa36a70784773594008506fc23ac008252089470997970c51812dc3a010c7d01b50e0d17dc79c886b5e620f4800080c0");
    assert!(p["big_r"].as_str().unwrap().len() == 2 + 66 && p["s"].as_str().unwrap().len() == 2 + 64);
    let cfg: Value = e.desk.view("get_config").await?.json()?;
    assert_eq!(cfg["next_nonce"], 8);
    // The slashed NEAR stayed in the desk (house treasury).
    let after = e.desk.view_account().await?.balance;
    assert!(after.as_yoctonear() + 10u128.pow(22) > before.as_yoctonear() + NEAR_0_2);
    Ok(())
}

#[tokio::test]
async fn caller_and_input_rejections() -> anyhow::Result<()> {
    let e = setup().await?;
    assert!(failure(&e.pay(&e.stranger, 1, TO, NEAR_0_2, NEAR_0_2, 200).await).contains("E_NOT_GAME"));
    assert!(failure(&e.pay(&e.game, 1, TO, NEAR_0_2, NEAR_0_2 - 1, 200).await).contains("E_DEPOSIT_MISMATCH"));
    assert!(failure(&e.pay(&e.game, 1, TO, NEAR_0_2, NEAR_0_2, 60).await).contains("E_GAS_TOO_LOW"));
    assert!(failure(&e.pay(&e.game, 1, "0xnothex", NEAR_0_2, NEAR_0_2, 200).await).contains("E_BAD_ADDRESS"));
    assert!(e.payout(1).await.is_null(), "rejected calls leave no record");
    let r = e.stranger.call(e.desk.id(), "prepare").args_json(json!({"next_nonce": 0, "max_fee_per_gas": "1", "max_priority_fee_per_gas": "1"})).transact().await?;
    assert!(failure(&r).contains("E_NOT_OWNER"));
    // A rejected pay refunds the game contract's deposit.
    let bal = e.game.view_account().await?.balance;
    assert!(bal.as_near() >= 19, "deposit came back on failure");
    assert!(e.pay(&e.game, 1, TO, NEAR_0_2, NEAR_0_2, 200).await.is_success());
    assert!(failure(&e.pay(&e.game, 1, TO, NEAR_0_2, NEAR_0_2, 200).await).contains("E_ALREADY_PAID"));
    // Only the desk itself may run the callbacks.
    let r = e.stranger.call(e.desk.id(), "on_signed").args_json(json!({"season_id": 1})).transact().await?;
    assert!(failure(&r).contains("Method on_signed is private"), "{}", failure(&r));
    Ok(())
}

#[tokio::test]
async fn signer_failure_then_retry_and_wrong_key() -> anyhow::Result<()> {
    let e = setup().await?;
    e.owner("refresh_derived_address", json!({})).await;
    e.owner("prepare", json!({"next_nonce": 0, "max_fee_per_gas": "30000000000", "max_priority_fee_per_gas": "2000000000"})).await;

    e.signer.call("set_mode").args_json(json!({"mode": "fail"})).transact().await?.into_result()?;
    assert!(e.pay(&e.game, 9, TO, NEAR_0_2, NEAR_0_2, 200).await.is_success(), "pay_evm itself still succeeds");
    let p = e.payout(9).await;
    assert_eq!((p["status"].as_str(), p["error"].as_str()), (Some("Failed"), Some("E_SIGN_FAILED")), "{p}");
    let cfg: Value = e.desk.view("get_config").await?.json()?;
    assert_eq!(cfg["next_nonce"], 0, "failed signing returns the nonce");

    e.signer.call("set_mode").args_json(json!({"mode": "ok"})).transact().await?.into_result()?;
    assert!(failure(&e.stranger.call(e.desk.id(), "retry_payout").args_json(json!({"season_id": 9})).gas(Gas::from_tgas(100)).transact().await?).contains("E_NOT_OWNER"));
    assert!(e.owner("retry_payout", json!({"season_id": 9})).await.is_success());
    let p = e.payout(9).await;
    assert_eq!((p["status"].as_str(), p["verified"].as_bool(), p["nonce"].as_u64()), (Some("Signed"), Some(true), Some(0)), "{p}");
    assert!(failure(&e.owner("retry_payout", json!({"season_id": 9})).await).contains("E_NOT_FAILED"));

    // A valid signature by a key that is not the desk's must never be accepted.
    e.signer.call("set_mode").args_json(json!({"mode": "wrong_key"})).transact().await?.into_result()?;
    assert!(e.pay(&e.game, 10, TO, NEAR_0_2, NEAR_0_2, 200).await.is_success());
    let p = e.payout(10).await;
    assert_eq!((p["status"].as_str(), p["error"].as_str()), (Some("Failed"), Some("E_SIG_MISMATCH")), "{p}");
    Ok(())
}
