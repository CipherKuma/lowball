#![allow(unused_must_use)]
//! U1: NEP-519 yield/resume leniency clock on real sandbox blocks.
mod common;
use common::*;
use serde_json::json;
use std::task::Poll;

const WINDOW: u64 = 200;

#[tokio::test]
async fn offer_exposes_deadline_and_blocks_a_second_window() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.create_season(3).await;
    e.post_bonds(sid).await;
    e.play_lot(sid, 100, [40; 5]).await;
    let _st = e.offer(sid).await;
    let s = e.season(sid).await;
    let ob = s["leniency_open_block"].as_u64().expect("open block");
    assert_eq!(s["leniency_deadline_block"].as_u64().unwrap(), ob + WINDOW);
    assert_eq!((s["leniency_open"].as_bool(), s["holdouts"].as_u64()), (Some(true), Some(0)));
    // one window per day: a second offer while open is refused
    assert_eq!(e.offer_err(&e.player, sid).await.as_deref(), Some("E_LENIENCY_OPEN"));
    Ok(())
}

#[tokio::test]
async fn timeout_records_holdout_then_confession_is_refused() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.create_season(3).await;
    e.post_bonds(sid).await;
    e.play_lot(sid, 100, [40; 5]).await;
    let st = e.offer(sid).await;
    let p = e.pact(sid, &[0, 1, 2]);
    assert_eq!(e.season(sid).await["holdouts"].as_u64(), Some(0)); // inside the window nothing is recorded
    e.worker.fast_forward(WINDOW + 20).await?;
    let s = e.season(sid).await;
    assert_eq!(s["holdouts"].as_u64(), Some(1), "yield timeout callback must record the holdout: {s}");
    assert_eq!(s["leniency_open"].as_bool(), Some(false));
    assert!(s["leniency_open_block"].is_null(), "window cleared by the callback");
    assert_code(e.confess(sid, 0, &p, &[0, 1, 2]).await, "E_NO_LENIENCY");
    assert_eq!(e.season(sid).await["status"], "Open");

    // the offer tx is final now and carries both events (leniency_open from the call, holdout from the callback)
    let Poll::Ready(res) = st.status().await? else { panic!("offer tx still pending after timeout") };
    assert!(res.is_success(), "{:?}", res.failures());
    let ev = Env::events(&res);
    let open = ev.iter().find(|v| v["event"] == "leniency_open").expect("leniency_open event");
    assert_eq!((open["standard"].as_str(), open["version"].as_str()), (Some("lowball"), Some("1.0.0")));
    let d = &open["data"][0];
    assert_eq!((d["season_id"].as_u64(), d["day"].as_u64(), d["window"].as_u64()), (Some(sid), Some(1), Some(1)));
    assert_eq!(d["deadline_block"].as_u64().unwrap(), d["open_block"].as_u64().unwrap() + WINDOW);
    let hold = ev.iter().find(|v| v["event"] == "holdout").expect("holdout event");
    let h = &hold["data"][0];
    assert_eq!((h["reason"].as_str(), h["holdouts"].as_u64(), h["season_id"].as_u64()), (Some("timeout"), Some(1), Some(sid)));

    // the player may open a fresh window the same day after the timeout, and a confession lands in it
    e.offer(sid).await;
    let s = e.season(sid).await;
    assert_eq!((s["leniency_windows"].as_u64(), s["leniency_open"].as_bool()), (Some(2), Some(true)));
    e.ok_confess(sid, 0, &p, &[0, 1, 2]).await;
    assert_eq!(e.season(sid).await["status"], "Confessed");
    Ok(())
}

#[tokio::test]
async fn confession_resumes_the_yield_and_no_holdout_follows() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    let p = e.pact(sid, &[0, 1, 2]);
    let r = e.confess(sid, 0, &p, &[0, 1, 2]).await;
    assert!(r.is_success(), "{:?}", r.failures());
    let ev = Env::events(&r);
    let names: Vec<&str> = ev.iter().map(|v| v["event"].as_str().unwrap()).collect();
    assert!(names.contains(&"confession") && names.contains(&"slash"), "{names:?}");
    let slash = ev.iter().find(|v| v["event"] == "slash").unwrap();
    assert_eq!(slash["data"][0]["total_yocto"], (2 * BOND).to_string());
    assert_eq!(slash["data"][0]["slashed"].as_array().unwrap().len(), 2);
    assert_eq!(slash["data"][0]["payout_route"], "near");
    let conf = ev.iter().find(|v| v["event"] == "confession").unwrap();
    assert_eq!(conf["data"][0]["confessor"], e.buyers[0].id().to_string());
    // the callback settled the window immediately (no 200-block wait)
    e.worker.fast_forward(4).await?;
    let s = e.season(sid).await;
    assert_eq!((s["status"].as_str(), s["leniency_open"].as_bool(), s["holdouts"].as_u64()), (Some("Confessed"), Some(false), Some(0)));
    assert!(s["leniency_open_block"].is_null(), "resume callback cleared the window");
    // a second confession (second resume attempt) is refused; the spent yield stays quiet afterwards
    let p2 = e.pact(sid, &[1, 2, 3]);
    assert_code(e.confess(sid, 1, &p2, &[1, 2, 3]).await, "E_ALREADY_CONFESSED");
    e.worker.fast_forward(WINDOW + 20).await?;
    assert_eq!(e.season(sid).await["holdouts"].as_u64(), Some(0), "timeout after a resume must not count as holdout");
    Ok(())
}

#[tokio::test]
async fn next_day_supersedes_old_window_and_close_cancels_pending() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    // day 2 opens while day 1's yield is still pending: the old window is dead, a fresh one is allowed
    e.play_lot(sid, 100, [40; 5]).await;
    let p = e.pact(sid, &[0, 1, 2]);
    assert_code(e.confess(sid, 0, &p, &[0, 1, 2]).await, "E_NO_LENIENCY");
    e.offer(sid).await;
    assert_eq!(e.season(sid).await["leniency_windows"].as_u64(), Some(2));
    // closing the season with windows pending: their later timeouts must not count as holdouts
    e.ok(&e.house, "close_season", json!({"season_id": sid})).await;
    e.worker.fast_forward(WINDOW + 20).await?;
    let s = e.season(sid).await;
    assert_eq!((s["status"].as_str(), s["holdouts"].as_u64()), (Some("Closed"), Some(0)));
    Ok(())
}
