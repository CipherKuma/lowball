#![allow(unused_must_use)]
//! U3 (game-contract half): optional payout_evm routes the slashed NEAR to desk.pay_evm.
//! The desk here is contract/mock-desk (records the call); the real desk is contracts/payout-desk.
mod common;
use common::*;
use near_workspaces::Account;
use serde_json::{json, Value};

const EVM: &str = "0x00000000000000000000000000000000000dEaD1";

async fn evm_season(e: &Env) -> u64 {
    let sid = e.create_season_evm(3, EVM).await;
    e.post_bonds(sid).await;
    e.play_lot(sid, 100, [40; 5]).await;
    e.offer(sid).await;
    sid
}

/// The player also gets back the unused gas of the resolved yield callback (about 0.011 NEAR), so
/// balance deltas are compared with this slack; bonds are 1 NEAR so it cannot hide a missing payout.
const GAS_SLACK: u128 = 30_000_000_000_000_000_000_000;

#[track_caller]
fn near_eq(got: u128, want: u128) {
    assert!(got >= want && got - want <= GAS_SLACK, "got {got}, want {want} (+ up to {GAS_SLACK} gas refund)");
}

async fn desk_balance(e: &Env, desk: &Account) -> u128 {
    e.balance(desk).await
}

#[tokio::test]
async fn slashed_near_goes_to_desk_not_player() -> anyhow::Result<()> {
    let e = setup().await?;
    let desk = e.deploy_desk().await;
    let sid = evm_season(&e).await;
    assert_eq!(e.season(sid).await["payout_evm"], EVM);
    let (player0, desk0) = (e.balance(&e.player).await, desk_balance(&e, &desk).await);
    let p = e.pact(sid, &[0, 1, 2]);
    let r = e.ok_confess(sid, 0, &p, &[0, 1, 2]).await;
    let (player1, desk1) = (e.balance(&e.player).await, desk_balance(&e, &desk).await);
    near_eq(player1 - player0, 0);
    near_eq(desk1 - desk0, 2 * BOND); // slashed sum plus a few micro-NEAR of gas rewards
    let rec: Value = desk.view(desk.id(), "get_payout").args_json(json!({"season_id": sid})).await?.json()?;
    assert_eq!(rec["to"], EVM);
    assert_eq!(rec["amount_yocto"], (2 * BOND).to_string());
    assert_eq!(rec["caller"], e.contract.id().to_string());
    let s = e.season(sid).await;
    assert_eq!((s["payout_route"].as_str(), s["player_payout"].as_str()), (Some("evm"), Some(&*(2 * BOND).to_string())));
    let ev = Env::events(&r);
    let slash = ev.iter().find(|v| v["event"] == "slash").unwrap();
    assert_eq!((slash["data"][0]["payout_route"].as_str(), slash["data"][0]["payout_evm"].as_str()), (Some("evm"), Some(EVM)));
    let route = ev.iter().find(|v| v["event"] == "payout_route").expect("payout_route event from callback");
    assert_eq!(route["data"][0]["route"], "evm");
    Ok(())
}

#[tokio::test]
async fn desk_failure_falls_back_to_paying_the_player() -> anyhow::Result<()> {
    let e = setup().await?;
    let desk = e.deploy_desk().await;
    desk.call(desk.id(), "set_fail").args_json(json!({"fail": true})).transact().await?.into_result()?;
    let sid = evm_season(&e).await;
    let (player0, desk0) = (e.balance(&e.player).await, desk_balance(&e, &desk).await);
    let p = e.pact(sid, &[0, 1, 2]);
    let r = e.ok_confess(sid, 0, &p, &[0, 1, 2]).await;
    near_eq(e.balance(&e.player).await - player0, 2 * BOND);
    assert!(desk_balance(&e, &desk).await.abs_diff(desk0) < 1_000_000_000_000_000_000_000, "failed desk call keeps no NEAR");
    let s = e.season(sid).await;
    assert_eq!(s["payout_route"], "evm_failed_near");
    let ev = Env::events(&r);
    assert_eq!(ev.iter().find(|v| v["event"] == "payout_route").unwrap()["data"][0]["route"], "evm_failed_near");
    Ok(())
}

#[tokio::test]
async fn missing_desk_account_also_falls_back() -> anyhow::Result<()> {
    let e = setup().await?; // no desk deployed at desk.<contract>
    let sid = evm_season(&e).await;
    let player0 = e.balance(&e.player).await;
    let p = e.pact(sid, &[0, 1, 2]);
    e.ok_confess(sid, 0, &p, &[0, 1, 2]).await;
    near_eq(e.balance(&e.player).await - player0, 2 * BOND);
    assert_eq!(e.season(sid).await["payout_route"], "evm_failed_near");
    Ok(())
}

#[tokio::test]
async fn evm_address_validation_and_default_route() -> anyhow::Result<()> {
    let e = setup().await?;
    for bad in ["0x1234", "dEaD000000000000000000000000000000000001ab", "0xZZ00000000000000000000000000000000000000"] {
        let r = e
            .call(&e.house, "create_season", json!({"player": e.player.id(), "buyers": e.ids(), "days": 3, "bond": BOND.to_string(), "payout_evm": bad}))
            .await;
        assert_code(r, "E_BAD_EVM");
    }
    // without payout_evm the player is paid in NEAR exactly as before
    let sid = e.leniency_ready(3).await;
    let player0 = e.balance(&e.player).await;
    let p = e.pact(sid, &[0, 1, 2]);
    e.ok_confess(sid, 0, &p, &[0, 1, 2]).await;
    near_eq(e.balance(&e.player).await - player0, 2 * BOND);
    let s = e.season(sid).await;
    assert_eq!((s["payout_route"].as_str(), s["payout_evm"].is_null()), (Some("near"), true));
    // set_desk is house-only
    assert_code(e.call(&e.buyers[0], "set_desk", json!({"desk": "x.near"})).await, "E_NOT_HOUSE");
    Ok(())
}
