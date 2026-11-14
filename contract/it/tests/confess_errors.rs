#![allow(unused_must_use)]
mod common;
use common::*;
use serde_json::json;

/// Every confession rejection, each against a live sandbox contract.
#[tokio::test]
async fn confess_error_matrix() -> anyhow::Result<()> {
    let e = setup().await?;

    // E_NO_LENIENCY: window never opened (even a well-formed, fully signed pact is refused).
    let s0 = e.create_season(3).await;
    e.post_bonds(s0).await;
    e.play_lot(s0, 100, [40; 5]).await;
    let p0 = e.pact(s0, &[0, 1, 2]);
    assert_code(e.confess(s0, 0, &p0, &[0, 1, 2]).await, "E_NO_LENIENCY");

    // Season under test: leniency window open on day 1.
    let sid = e.leniency_ready(3).await;
    let p = e.pact(sid, &[0, 1, 2]);

    // E_NOT_BUYER: the player (or anyone outside the season) cannot confess.
    let r = e.call(&e.player, "confess", e.cs(json!({"season_id": sid, "pact": pact_json(&p), "signatures": e.sigs(&p, &[0, 1])}), 0)).await;
    assert_code(r, "E_NOT_BUYER");

    // E_SEASON_MISMATCH: pact.season_id != season.
    let wrong = PactB { season_id: 77, ..p.clone() };
    assert_code(e.confess(sid, 0, &wrong, &[0, 1]).await, "E_SEASON_MISMATCH");

    // Replay: pact genuinely signed for season `sid`, submitted to another season of the same buyers.
    let other = e.leniency_ready(3).await;
    assert_code(e.confess(other, 0, &p, &[0, 1, 2]).await, "E_SEASON_MISMATCH");
    // ...and rewriting season_id to match breaks every signature.
    let rewritten = PactB { season_id: other, ..p.clone() };
    let r = e.call(&e.buyers[0], "confess", e.cs(json!({"season_id": other, "pact": pact_json(&rewritten), "signatures": e.sigs(&p, &[0, 1, 2])}), 0)).await;
    assert_code(r, "E_BAD_SIG");

    // E_NOT_MEMBER: a pact naming a non-season account.
    let mut with_outsider = e.pact(sid, &[0, 1]);
    with_outsider.members.push(e.player.id().to_string());
    assert_code(e.confess(sid, 0, &with_outsider, &[0, 1]).await, "E_NOT_MEMBER");
    // caller not in members
    let no_caller = e.pact(sid, &[1, 2]);
    assert_code(e.confess(sid, 0, &no_caller, &[0, 1, 2]).await, "E_NOT_MEMBER");
    // signer (buyer 3) is a season buyer but not a pact member
    assert_code(e.confess(sid, 0, &p, &[0, 1, 3]).await, "E_NOT_MEMBER");
    // signature from a non-season account
    let mut sigs = e.sigs(&p, &[0, 1]);
    sigs.as_array_mut().unwrap().push(sig_json(e.player.id(), &e.keys[2], &p));
    let r = e.call(&e.buyers[0], "confess", e.cs(json!({"season_id": sid, "pact": pact_json(&p), "signatures": sigs}), 0)).await;
    assert_code(r, "E_NOT_MEMBER");

    // E_DUP_SIGNER: duplicate signature, and duplicate member.
    assert_code(e.confess(sid, 0, &p, &[0, 1, 1]).await, "E_DUP_SIGNER");
    let dup_member = e.pact(sid, &[0, 1, 1]);
    assert_code(e.confess(sid, 0, &dup_member, &[0, 1]).await, "E_DUP_SIGNER");

    // E_BAD_SIG: tampered cap, signature by a key the contract never saw, short signature,
    // one forged signature among valid ones.
    let tampered = PactB { cap: 41, ..p.clone() };
    let r = e.call(&e.buyers[0], "confess", e.cs(json!({"season_id": sid, "pact": pact_json(&tampered), "signatures": e.sigs(&p, &[0, 1])}), 0)).await;
    assert_code(r, "E_BAD_SIG");
    let mut unreg = e.sigs(&p, &[0]);
    unreg.as_array_mut().unwrap().push(sig_json(e.buyers[1].id(), &key_for(42), &p)); // unregistered key
    let r = e.call(&e.buyers[0], "confess", e.cs(json!({"season_id": sid, "pact": pact_json(&p), "signatures": unreg}), 0)).await;
    assert_code(r, "E_BAD_SIG");
    let mut short = e.sigs(&p, &[0]);
    short.as_array_mut().unwrap().push(json!({"signer": e.buyers[1].id(), "signature": b64(&[7u8; 63])}));
    let r = e.call(&e.buyers[0], "confess", e.cs(json!({"season_id": sid, "pact": pact_json(&p), "signatures": short}), 0)).await;
    assert_code(r, "E_BAD_SIG");
    let mut swapped = e.sigs(&p, &[0, 1]);
    swapped.as_array_mut().unwrap().push(sig_json(e.buyers[2].id(), &e.keys[3], &p)); // b2's name, b3's key
    let r = e.call(&e.buyers[0], "confess", e.cs(json!({"season_id": sid, "pact": pact_json(&p), "signatures": swapped}), 0)).await;
    assert_code(r, "E_BAD_SIG");

    // E_TOO_FEW: only the caller signed; or two others signed but not the caller.
    assert_code(e.confess(sid, 0, &p, &[0]).await, "E_TOO_FEW");
    assert_code(e.confess(sid, 0, &p, &[1, 2]).await, "E_TOO_FEW");
    assert_code(e.confess(sid, 0, &p, &[]).await, "E_TOO_FEW");

    // None of the failed attempts changed state.
    let s = e.season(sid).await;
    assert_eq!(s["status"], "Open");
    assert!(s["first_confessor"].is_null());
    Ok(())
}

/// Re-registering a key after the season exists must not change who can sign for it.
#[tokio::test]
async fn key_rotation_does_not_affect_running_season() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    e.ok(&e.buyers[1], "register_buyer_key", json!({"public_key": b64(&key_for(50).verifying_key().to_bytes())})).await;
    let p = e.pact(sid, &[0, 1]);
    // signature with the (snapshotted) original key still verifies
    e.ok(&e.buyers[0].clone(), "confess", e.cs(json!({"season_id": sid, "pact": pact_json(&p), "signatures": e.sigs(&p, &[0, 1])}), 0)).await;
    let got: serde_json::Value = e.contract.view("get_buyer_key").args_json(json!({"account": e.buyers[1].id()})).await?.json()?;
    assert_eq!(got.as_str().unwrap(), b64(&key_for(50).verifying_key().to_bytes()));
    Ok(())
}

/// U5: the caller's own pact-key confession signature (season, confessor, nonce) is mandatory.
#[tokio::test]
async fn confession_signature_matrix() -> anyhow::Result<()> {
    let e = setup().await?;
    let sid = e.leniency_ready(3).await;
    let other = e.leniency_ready(3).await; // second season, same buyers, same keys
    let p = e.pact(sid, &[0, 1, 2]);
    let po = e.pact(other, &[0, 1, 2]); // same nonce, different season
    assert_eq!(p.nonce, po.nonce);
    let who = e.buyers[0].id().to_string();
    let args = |sid: u64, p: &PactB, sigs: &[usize], cs: String| {
        json!({"season_id": sid, "pact": pact_json(p), "signatures": e.sigs(p, sigs), "confession_sig": cs})
    };
    let good = confession_sig(&e.keys[0], sid, &who, p.nonce);
    let send = |a: serde_json::Value| {
        let e = &e;
        async move { e.call(&e.buyers[0], "confess", a).await }
    };
    let all = [0usize, 1, 2];
    // missing (empty) and wrong length
    assert_code(send(args(sid, &p, &all, String::new())).await, "E_BAD_CONFESSION_SIG");
    assert_code(send(args(sid, &p, &all, b64(&[1u8; 63]))).await, "E_BAD_CONFESSION_SIG");
    // wrong key: unregistered key, and another buyer's pact key (a valid signature, but not the caller's)
    assert_code(send(args(sid, &p, &all, confession_sig(&key_for(42), sid, &who, p.nonce))).await, "E_BAD_CONFESSION_SIG");
    assert_code(send(args(sid, &p, &all, confession_sig(&e.keys[1], sid, &who, p.nonce))).await, "E_BAD_CONFESSION_SIG");
    // wrong season, wrong nonce, wrong confessor name
    assert_code(send(args(sid, &p, &all, confession_sig(&e.keys[0], other, &who, p.nonce))).await, "E_BAD_CONFESSION_SIG");
    assert_code(send(args(sid, &p, &all, confession_sig(&e.keys[0], sid, &who, p.nonce + 1))).await, "E_BAD_CONFESSION_SIG");
    let other_name = e.buyers[1].id().to_string();
    assert_code(send(args(sid, &p, &all, confession_sig(&e.keys[0], sid, &other_name, p.nonce))).await, "E_BAD_CONFESSION_SIG");
    // replay across seasons: the valid signature for `sid` submitted to `other` with a correctly signed `other` pact
    assert_code(send(args(other, &po, &all, good.clone())).await, "E_BAD_CONFESSION_SIG");
    assert_eq!(e.season(sid).await["status"], "Open");
    assert_eq!(e.season(other).await["status"], "Open");
    // the right signature works, only for its own season
    let r = send(args(sid, &p, &all, good.clone())).await;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(e.season(sid).await["status"], "Confessed");
    assert_eq!(e.season(other).await["status"], "Open");
    // order: a bad pact signature is reported before a bad confession signature
    let tampered = PactB { cap: 41, ..po.clone() };
    let mut v = args(other, &tampered, &all, String::new());
    v["signatures"] = e.sigs(&po, &all);
    assert_code(send(v).await, "E_BAD_SIG");
    // order: E_TOO_FEW comes after the confession signature check
    let own_good = confession_sig(&e.keys[0], other, &who, po.nonce);
    assert_code(send(args(other, &po, &[1, 2], own_good)).await, "E_TOO_FEW");
    assert_code(send(args(other, &po, &[1, 2], String::new())).await, "E_BAD_CONFESSION_SIG");
    Ok(())
}
