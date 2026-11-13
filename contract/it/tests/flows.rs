#![allow(unused_must_use)]
mod common;
use common::*;
use near_workspaces::types::NearToken;
use serde_json::json;

const GAS_SLACK: u128 = 50_000_000_000_000_000_000_000; // 0.05 NEAR

fn yocto(v: &serde_json::Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

#[tokio::test]
async fn confession_exact_accounting() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    // ring of four (marlow, odile, sully, ines); deacon (4) never joined
    let p = e.pact(sid, &[0, 1, 2, 3]);
    let before_player = e.balance(&e.player).await;
    let before: Vec<u128> = futures_balances(&e).await;
    let contract_before = e.contract.view_account().await?.balance.as_yoctonear();

    let r = e.confess(sid, 3, &p, &[0, 1, 2, 3]).await; // ines confesses
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(yocto(&serde_json::from_slice::<serde_json::Value>(&r.raw_bytes()?)?), 3 * BOND);

    // player receives EXACTLY the slashed sum (they paid no gas on this call)
    assert_eq!(e.balance(&e.player).await - before_player, 3 * BOND);
    let after = futures_balances(&e).await;
    for i in [0, 1, 2, 4] {
        assert_eq!(after[i], before[i], "buyer {i} must be untouched until close");
    }
    // confessor refunded in full (minus only the gas they paid)
    let d = after[3] - before[3];
    assert!(d <= BOND && d + GAS_SLACK >= BOND, "confessor delta {d}");
    let contract_after = e.contract.view_account().await?.balance.as_yoctonear();
    assert!(contract_before - contract_after + GAS_SLACK >= 4 * BOND);

    let s = e.season(sid).await;
    assert_eq!(s["status"], "Confessed");
    assert_eq!(s["first_confessor"], e.buyers[3].id().as_str());
    assert_eq!(yocto(&s["slashed_total"]), 3 * BOND);
    assert_eq!(yocto(&s["player_payout"]), 3 * BOND);
    assert_eq!(s["pact_cap"], 40);
    assert_eq!(s["pact_nonce"], p.nonce.to_string());
    assert_eq!(s["confessed_day"], 1);
    assert_eq!(s["verified_signers"].as_array().unwrap().len(), 4);
    assert_eq!(s["shortfall"], 60);

    // second confession (even by a slashed buyer with a valid pact) is refused
    assert_code(e.confess(sid, 0, &p, &[0, 1, 2, 3]).await, "E_ALREADY_CONFESSED");
    // nothing more opens once confessed
    let r = e.call(&e.house, "open_lot", json!({"season_id": sid, "species": "Cod", "fair_value": 90})).await;
    assert_code(r, "E_SEASON_OVER");
    // withdraw: slashed refused, confessor already refunded
    assert_code(e.call(&e.buyers[0], "withdraw_bond", json!({"season_id": sid})).await, "E_SLASHED");
    assert_code(e.call(&e.buyers[3], "withdraw_bond", json!({"season_id": sid})).await, "E_ALREADY_WITHDRAWN");

    // close: the non-signer is refunded EXACTLY one bond; slashed get nothing
    let deacon_before = e.balance(&e.buyers[4]).await;
    let slashed_before = e.balance(&e.buyers[0]).await;
    e.ok(&e.house, "close_season", json!({"season_id": sid})).await;
    assert_eq!(e.balance(&e.buyers[4]).await - deacon_before, BOND);
    assert_eq!(e.balance(&e.buyers[0]).await, slashed_before);
    assert_eq!(e.season(sid).await["status"], "Closed");
    assert_code(e.confess(sid, 0, &p, &[0, 1, 2, 3]).await, "E_CLOSED");
    assert_code(e.call(&e.buyers[4], "withdraw_bond", json!({"season_id": sid})).await, "E_ALREADY_WITHDRAWN");
    Ok(())
}

async fn futures_balances(e: &Env) -> Vec<u128> {
    let mut v = vec![];
    for b in &e.buyers {
        v.push(e.balance(b).await);
    }
    v
}

#[tokio::test]
async fn non_signer_can_withdraw_after_confession() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    let p = e.pact(sid, &[0, 1]);
    e.ok(&e.buyers[0].clone(), "confess", json!({"season_id": sid, "pact": pact_json(&p), "signatures": e.sigs(&p, &[0, 1])})).await;
    // sully (2) is not in the pact: withdraws own bond, gas aside
    let before = e.balance(&e.buyers[2]).await;
    e.ok(&e.buyers[2], "withdraw_bond", json!({"season_id": sid})).await;
    let d = e.balance(&e.buyers[2]).await + GAS_SLACK;
    assert!(d >= before + BOND && e.balance(&e.buyers[2]).await <= before + BOND);
    assert_code(e.call(&e.buyers[2], "withdraw_bond", json!({"season_id": sid})).await, "E_ALREADY_WITHDRAWN");
    Ok(())
}

#[tokio::test]
async fn confession_race_two_concurrent_txs() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    let p = e.pact(sid, &[0, 1, 2]);
    let args = |_who: usize| json!({"season_id": sid, "pact": pact_json(&p), "signatures": e.sigs(&p, &[0, 1, 2])});
    let t0 = e.buyers[0].call(e.contract.id(), "confess").args_json(args(0)).max_gas().transact_async().await?;
    let t1 = e.buyers[1].call(e.contract.id(), "confess").args_json(args(1)).max_gas().transact_async().await?;
    let (r0, r1) = (t0.await?, t1.await?);
    let wins = [r0.is_success(), r1.is_success()];
    assert_eq!(wins.iter().filter(|w| **w).count(), 1, "exactly one confession must succeed: {wins:?}");
    let loser = if r0.is_success() { r1 } else { r0 };
    assert_code(loser, "E_ALREADY_CONFESSED");
    let s = e.season(sid).await;
    let winner = if wins[0] { 0 } else { 1 };
    assert_eq!(s["first_confessor"], e.buyers[winner].id().as_str());
    assert_eq!(yocto(&s["slashed_total"]), 2 * BOND);
    Ok(())
}

#[tokio::test]
async fn confession_race_three_concurrent_txs() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    let p = e.pact(sid, &[0, 1, 2, 3, 4]);
    let all = [0, 1, 2, 3, 4];
    let mut txs = vec![];
    for who in [0usize, 2, 4] {
        let args = json!({"season_id": sid, "pact": pact_json(&p), "signatures": e.sigs(&p, &all)});
        txs.push(e.buyers[who].call(e.contract.id(), "confess").args_json(args).max_gas().transact_async().await?);
    }
    let mut results = vec![];
    for t in txs {
        results.push(t.await?);
    }
    assert_eq!(results.iter().filter(|r| r.is_success()).count(), 1);
    for r in results.into_iter().filter(|r| r.is_failure()) {
        assert_code(r, "E_ALREADY_CONFESSED");
    }
    assert_eq!(yocto(&e.season(sid).await["slashed_total"]), 4 * BOND);
    Ok(())
}

#[tokio::test]
async fn honest_season_refunds_everyone_exactly() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.create_season(1).await;
    e.post_bonds(sid).await;
    // withdraw while Open is refused
    assert_code(e.call(&e.buyers[0], "withdraw_bond", json!({"season_id": sid})).await, "E_SEASON_OPEN");
    e.play_lot(sid, 100, [40, 55, 30, 60, 45]).await;
    let s = e.season(sid).await;
    assert_eq!(s["lots"][0]["winner"], e.buyers[3].id().as_str());
    assert_eq!(s["lots"][0]["price"], 60);
    assert_eq!(s["lots"][0]["identical"], false);
    assert_eq!(s["shortfall"], 40);
    // day budget exhausted
    assert_code(e.call(&e.house, "open_lot", json!({"season_id": sid, "species": "Cod", "fair_value": 90})).await, "E_PAST_DAYS");
    let before = futures_balances(&e).await;
    // anyone (the player) may close once the last lot is settled
    e.ok(&e.player, "close_season", json!({"season_id": sid})).await;
    let after = futures_balances(&e).await;
    for i in 0..5 {
        assert_eq!(after[i] - before[i], BOND);
    }
    Ok(())
}

#[tokio::test]
async fn permissions_and_bid_rules_on_chain() -> anyhow::Result<()> {
    let e = setup().await?;
    let stranger = e.worker.root_account()?;
    // non-house
    let args = json!({"player": e.player.id(), "buyers": e.ids(), "days": 3, "bond": BOND.to_string()});
    assert_code(e.call(&e.buyers[0], "create_season", args.clone()).await, "E_NOT_HOUSE");
    assert_code(e.call(&e.player, "create_season", args).await, "E_NOT_HOUSE");
    let sid = e.create_season(1).await;
    assert_code(e.call(&e.buyers[0], "open_lot", json!({"season_id": sid, "species": "Hake", "fair_value": 100})).await, "E_NOT_HOUSE");
    // bid before bond / lot before bonds
    assert_code(e.call(&e.buyers[0], "commit_bid", json!({"season_id": sid, "hash": b64(&[1; 32])})).await, "E_NO_BOND");
    assert_code(e.call(&e.house, "open_lot", json!({"season_id": sid, "species": "Hake", "fair_value": 100})).await, "E_BONDS_MISSING");
    // wrong deposit
    let r = e.buyers[0]
        .call(e.contract.id(), "post_bond")
        .args_json(json!({"season_id": sid}))
        .deposit(NearToken::from_yoctonear(BOND - 1))
        .max_gas()
        .transact()
        .await?;
    assert_code(r, "E_BAD_DEPOSIT");
    e.post_bonds(sid).await;
    // non-player leniency
    assert_code(e.call(&e.buyers[0], "offer_leniency", json!({"season_id": sid})).await, "E_NOT_PLAYER");
    assert_code(e.call(&e.house, "offer_leniency", json!({"season_id": sid})).await, "E_NOT_PLAYER");
    assert_code(e.call(&e.player, "offer_leniency", json!({"season_id": sid})).await, "E_NO_DAY");
    // commit / reveal rules
    e.ok(&e.house, "open_lot", json!({"season_id": sid, "species": "Hake", "fair_value": 100})).await;
    assert_code(e.call(&e.house, "open_lot", json!({"season_id": sid, "species": "Cod", "fair_value": 90})).await, "E_LOT_OPEN");
    let salt = [3u8; 32];
    e.ok(&e.buyers[0], "commit_bid", json!({"season_id": sid, "hash": commit_hash(40, &salt)})).await;
    assert_code(e.call(&e.buyers[0], "commit_bid", json!({"season_id": sid, "hash": commit_hash(41, &salt)})).await, "E_ALREADY_COMMITTED");
    assert_code(e.call(&e.buyers[1], "reveal_bid", json!({"season_id": sid, "amount": 40, "salt": b64(&salt)})).await, "E_NO_COMMIT");
    assert_code(e.call(&e.buyers[0], "reveal_bid", json!({"season_id": sid, "amount": 41, "salt": b64(&salt)})).await, "E_BAD_REVEAL");
    assert_code(e.call(&e.buyers[0], "reveal_bid", json!({"season_id": sid, "amount": 40, "salt": b64(&[4u8; 32])})).await, "E_BAD_REVEAL");
    e.ok(&e.buyers[0], "reveal_bid", json!({"season_id": sid, "amount": 40, "salt": b64(&salt)})).await;
    assert_code(e.call(&e.buyers[0], "reveal_bid", json!({"season_id": sid, "amount": 40, "salt": b64(&salt)})).await, "E_ALREADY_REVEALED");
    // settle needs all five unless the house forces it
    assert_code(e.call(&e.buyers[0], "settle_lot", json!({"season_id": sid})).await, "E_NOT_READY");
    // non-house, non-buyer cannot close early
    assert_code(e.call(&e.buyers[0], "close_season", json!({"season_id": sid})).await, "E_NOT_FINISHED");
    let r = stranger.call(e.contract.id(), "create_season").args_json(json!({"player": e.player.id(), "buyers": e.ids(), "days": 3, "bond": "1"})).transact().await?;
    assert_code(r, "E_NOT_HOUSE");
    e.ok(&e.house, "settle_lot", json!({"season_id": sid})).await;
    let s = e.season(sid).await;
    assert_eq!(s["lots"][0]["price"], 40);
    assert_eq!(s["lots"][0]["reveals"].as_array().unwrap().len(), 1);
    Ok(())
}

#[tokio::test]
async fn get_config_and_unknown_season() -> anyhow::Result<()> {
    let e = setup().await?;
    let cfg: serde_json::Value = e.contract.view("get_config").await?.json()?;
    assert_eq!(cfg["house"], e.house.id().as_str());
    assert_eq!(cfg["buyers_per_season"], 5);
    assert_eq!(cfg["pact_prefix"], "LOWBALL-PACT-v1:");
    let r = e.contract.view("get_season").args_json(json!({"season_id": 9})).await;
    assert!(format!("{:?}", r.err().unwrap()).contains("E_NO_SEASON"));
    Ok(())
}
