#![allow(unused_must_use)]
//! Storage staking and gas for a full 20-day season (the house funds the contract account).
mod common;
use common::*;
use serde_json::json;

const BYTE_COST: u128 = 10_000_000_000_000_000_000; // 1e19 yocto per stored byte

#[tokio::test]
async fn full_season_storage_and_gas() -> anyhow::Result<()> {
    let e = setup().await?;
    let usage = || async { e.contract.view_account().await.unwrap().storage_usage };
    let u0 = usage().await;
    let sid = e.create_season(20).await;
    e.post_bonds(sid).await;
    let u1 = usage().await;
    for day in 0..20u32 {
        e.play_lot(sid, 100, [40 + (day % 3), 40, 40, 40, 40]).await;
    }
    let u2 = usage().await;
    let s = e.season(sid).await;
    assert_eq!(s["lots"].as_array().unwrap().len(), 20);

    // gas of the heaviest call: confession with five verified signatures
    e.offer(sid).await;
    let p = e.pact(sid, &[0, 1, 2, 3, 4]);
    let r = e.confess(sid, 2, &p, &[0, 1, 2, 3, 4]).await;
    assert!(r.is_success(), "{:?}", r.failures());
    let gas = r.total_gas_burnt.as_gas();
    println!(
        "COST season_create_bytes={} season_create_near={:.4} full_20_day_bytes={} full_20_day_near={:.4} confess_5_sigs_tgas={:.1}",
        u1 - u0,
        ((u1 - u0) as u128 * BYTE_COST) as f64 / 1e24,
        u2 - u0,
        ((u2 - u0) as u128 * BYTE_COST) as f64 / 1e24,
        gas as f64 / 1e12
    );
    assert!(gas < 100_000_000_000_000, "confess must stay well under 100 TGas, got {gas}");
    assert!((u2 - u0) as u128 * BYTE_COST < 100_000_000_000_000_000_000_000); // < 0.1 NEAR per season
    Ok(())
}
