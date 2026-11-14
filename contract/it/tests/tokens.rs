#![allow(unused_must_use)]
//! U2: NEP-245 catch tokens: mint into escrow on open_lot, transfer on settle_lot, return path.
mod common;
use common::*;
use serde_json::{json, Value};

fn mt_events(ev: &[Value], name: &str) -> Vec<Value> {
    ev.iter().filter(|v| v["standard"] == "nep245" && v["event"] == name).cloned().collect()
}

#[tokio::test]
async fn mint_to_escrow_then_transfer_to_winner_with_events() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.create_season(3).await;
    e.post_bonds(sid).await;
    let escrow = e.contract.id().clone();
    let tid = format!("s{sid}-d1");
    let (opened, settled) = e.play_lot_w(sid, "Atlantic cod", 42, 100, [40, 90, 50, 60, 70]).await;

    // mint event: standard NEP-245 shape, owner = escrow (the contract), memo names the player
    let m = mt_events(&Env::events(&opened), "mt_mint");
    assert_eq!(m.len(), 1);
    assert_eq!(m[0]["version"], "1.0.0");
    assert_eq!(
        m[0]["data"][0],
        json!({"owner_id": escrow, "token_ids": [tid], "amounts": ["42"], "memo": format!("escrow for {}", e.player.id())})
    );

    // transfer event on settlement: escrow -> highest bidder (buyer index 1), memo with price
    let t = mt_events(&Env::events(&settled), "mt_transfer");
    assert_eq!(t.len(), 1);
    assert_eq!(
        t[0]["data"][0],
        json!({"old_owner_id": escrow, "new_owner_id": e.buyers[1].id(), "token_ids": [tid], "amounts": ["42"], "memo": "sold at 90 marks"})
    );

    // balances and views
    assert_eq!(e.mt_balance(&escrow, &tid).await, 0);
    assert_eq!(e.mt_balance(e.buyers[1].id(), &tid).await, 42);
    assert_eq!(e.mt_balance(e.buyers[0].id(), &tid).await, 0);
    let supply: Option<String> = e.contract.view("mt_supply").args_json(json!({"token_id": tid})).await?.json()?;
    assert_eq!(supply.as_deref(), Some("42"));
    let batch: Vec<String> = e.contract.view("mt_batch_balance_of").args_json(json!({"account_id": e.buyers[1].id(), "token_ids": [tid, "s9-d9"]})).await?.json()?;
    assert_eq!(batch, vec!["42", "0"]);
    let toks: Vec<Value> = e.contract.view("mt_tokens_for_owner").args_json(json!({"account_id": e.buyers[1].id()})).await?.json()?;
    assert_eq!(toks.len(), 1);
    assert_eq!(toks[0]["token_id"], tid);
    assert_eq!(toks[0]["metadata"]["title"], format!("42 kg Atlantic cod — season {sid}, day 1"));
    let one: Vec<Option<Value>> = e.contract.view("mt_token").args_json(json!({"token_ids": [tid, "nope"]})).await?.json()?;
    assert_eq!(one[0].as_ref().unwrap()["owner_id"], e.buyers[1].id().to_string());
    assert!(one[1].is_none());
    let meta: Value = e.contract.view("mt_metadata_contract").await?.json()?;
    assert_eq!((meta["name"].as_str(), meta["symbol"].as_str(), meta["spec"].as_str()), (Some("Lowball Catch"), Some("CATCH"), Some("mt-1.0.0")));
    let lot = &e.season(sid).await["lots"][0];
    assert_eq!((lot["token_id"].as_str(), lot["weight_kg"].as_u64(), lot["token_owner"].as_str()), (Some(tid.as_str()), Some(42), Some(e.buyers[1].id().as_str())));

    // winner can move the fish on (whole lot, 1 yocto)
    let friend = e.worker.root_account()?;
    let r = e.buyers[1]
        .call(e.contract.id(), "mt_transfer")
        .args_json(json!({"receiver_id": friend.id(), "token_id": tid, "amount": "42", "memo": "gift"}))
        .deposit(near_workspaces::types::NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let t = mt_events(&Env::events(&r), "mt_transfer");
    assert_eq!(t[0]["data"][0]["memo"], "gift");
    assert_eq!(e.mt_balance(friend.id(), &tid).await, 42);
    // errors: not the owner any more, partial amount, no deposit
    let bad = |who: &near_workspaces::Account, amt: &str, dep: u128| {
        let who = who.clone();
        let (cid, friend) = (e.contract.id().clone(), e.buyers[2].id().clone());
        let amt = amt.to_string();
        let tid = tid.clone();
        async move {
            who.call(&cid, "mt_transfer")
                .args_json(json!({"receiver_id": friend, "token_id": tid, "amount": amt}))
                .deposit(near_workspaces::types::NearToken::from_yoctonear(dep))
                .max_gas()
                .transact()
                .await
                .unwrap()
        }
    };
    assert_code(bad(&e.buyers[1], "42", 1).await, "E_NOT_TOKEN_OWNER");
    assert_code(bad(&friend, "10", 1).await, "E_MT_PARTIAL");
    assert_code(bad(&friend, "42", 0).await, "E_NEED_1_YOCTO");
    Ok(())
}

#[tokio::test]
async fn unsold_lot_returns_to_player_at_close() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.create_season(3).await;
    e.post_bonds(sid).await;
    e.ok(&e.house, "open_lot", json!({"season_id": sid, "species": "Hake", "fair_value": 100, "weight_kg": 15})).await;
    let tid = format!("s{sid}-d1");
    assert_eq!(e.mt_balance(e.contract.id(), &tid).await, 15);
    let r = e.ok(&e.house, "close_season", json!({"season_id": sid})).await;
    let t = mt_events(&Env::events(&r), "mt_transfer");
    assert_eq!(t.len(), 1);
    assert_eq!(t[0]["data"][0]["new_owner_id"], e.player.id().to_string());
    assert_eq!(t[0]["data"][0]["memo"], "returned unsold");
    assert_eq!(e.mt_balance(e.contract.id(), &tid).await, 0);
    assert_eq!(e.mt_balance(e.player.id(), &tid).await, 15);
    Ok(())
}

#[tokio::test]
async fn confession_with_open_lot_returns_it_to_player() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    e.ok(&e.house, "open_lot", json!({"season_id": sid, "species": "Cod", "fair_value": 90, "weight_kg": 21})).await;
    // yield window belongs to day 1; day 2 is open so confession needs a fresh window
    e.offer(sid).await;
    let p = e.pact(sid, &[0, 1, 2]);
    let r = e.ok_confess(sid, 0, &p, &[0, 1, 2]).await;
    assert_eq!(mt_events(&Env::events(&r), "mt_transfer").len(), 1);
    assert_eq!(e.mt_balance(e.player.id(), &format!("s{sid}-d2")).await, 21);
    // day-1 token stays with its buyer
    assert_eq!(e.mt_balance(e.buyers[0].id(), &format!("s{sid}-d1")).await, 40);
    Ok(())
}

#[tokio::test]
async fn open_lot_rejects_zero_weight() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.create_season(3).await;
    e.post_bonds(sid).await;
    assert_code(e.call(&e.house, "open_lot", json!({"season_id": sid, "species": "Hake", "fair_value": 100, "weight_kg": 0})).await, "E_BAD_ARGS");
    // weight_kg is required (breaking change): omitting it fails to deserialize
    assert!(e.call(&e.house, "open_lot", json!({"season_id": sid, "species": "Hake", "fair_value": 100})).await.is_failure());
    Ok(())
}
