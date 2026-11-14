#![allow(unused_must_use)]
//! Deploy-time admin: `reset` (state wipe for redeploys) is callable by the contract account only.
mod common;
use common::*;
use serde_json::json;

#[tokio::test]
async fn reset_is_contract_only_and_wipes_state() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.create_season(3).await;
    assert_eq!(sid, 0);
    // house, buyers and strangers cannot wipe
    assert_code(e.call(&e.house, "reset", json!({"house": e.house.id()})).await, "E_NOT_CONTRACT");
    assert_code(e.call(&e.buyers[0], "reset", json!({"house": e.buyers[0].id()})).await, "E_NOT_CONTRACT");
    assert_eq!(e.season(0).await["status"], "Open");
    // the contract account itself (deploy script signs with its key) can
    let r = e.contract.as_account().call(e.contract.id(), "reset").args_json(json!({"house": e.house.id()})).max_gas().transact().await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let cfg: serde_json::Value = e.contract.view("get_config").await?.json()?;
    assert_eq!(cfg["season_count"].as_u64(), Some(0));
    assert_eq!(cfg["house"], e.house.id().to_string());
    // desk defaults to desk.<contract>; only the house may repoint it
    assert_code(e.call(&e.player, "set_desk", json!({"desk": "x.near"})).await, "E_NOT_HOUSE");
    Ok(())
}
