use super::*;

#[test]
fn settle_tie_identical_and_shortfall() {
    let mut c = bonded(3);
    lot_with_reveals(&mut c, &[40, 40, 40, 40, 40]);
    as_("anyone.testnet", 0);
    c.settle_lot(0);
    let s = c.get_season(0);
    let l = &s.lots[0];
    assert!(l.settled && l.identical);
    assert_eq!((l.price, l.winner.clone()), (40, Some(a("b1.testnet")))); // tie -> earliest reveal
    assert_eq!(s.shortfall, 60);
}

#[test]
fn settle_highest_wins_not_identical_floor_zero() {
    let mut c = bonded(3);
    lot_with_reveals(&mut c, &[40, 120, 80, 120, 10]);
    as_("anyone.testnet", 0);
    c.settle_lot(0);
    let s = c.get_season(0);
    assert_eq!(s.lots[0].winner, Some(a("b2.testnet")));
    assert!(!s.lots[0].identical);
    assert_eq!(s.shortfall, 0); // price above fair value floors at 0
}

#[test]
fn house_force_settles_partial_reveals() {
    let mut c = bonded(3);
    lot_with_reveals(&mut c, &[40, 50, 60]);
    as_("house.testnet", 0);
    c.settle_lot(0);
    let s = c.get_season(0);
    assert_eq!((s.lots[0].price, s.lots[0].identical), (60, false));
}

#[test]
fn leniency_window_closes_on_next_day_and_reopens_then() {
    let mut c = bonded(3);
    lot_with_reveals(&mut c, &[40; 5]);
    c.settle_lot(0);
    as_("player.testnet", 0);
    c.offer_leniency(0);
    let v = c.get_season(0);
    assert!(v.leniency_open);
    assert_eq!((v.leniency_open_block, v.leniency_deadline_block, v.holdouts), (Some(0), Some(200), 0));
    as_("house.testnet", 0);
    c.open_lot(0, "Cod".into(), 90, 40);
    let s = c.get_season(0);
    assert_eq!((s.leniency_day, s.leniency_open), (Some(1), false));
    // day 2: a fresh window may open even though day 1's yield has not timed out yet
    as_("player.testnet", 0);
    c.offer_leniency(0);
    let s = c.get_season(0);
    assert_eq!((s.leniency_day, s.leniency_open, s.leniency_windows), (Some(2), true, 2));
}

#[test]
fn stale_season_can_be_closed_by_anyone() {
    let mut c = bonded(3);
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(a("b1.testnet"))
        .block_timestamp(STALE_NS + 10)
        .build());
    c.close_season(0);
    assert_eq!(c.get_season(0).status, "Closed");
}

#[test]
fn views_report_config_and_keys() {
    let c = fresh(3);
    let cfg = c.get_config();
    assert_eq!((cfg.season_count, cfg.max_days, cfg.buyers_per_season), (1, 30, 5));
    assert_eq!(c.get_buyer_key(a("b3.testnet")).unwrap().0, vec![3u8; 32]);
    assert!(c.get_buyer_key(a("nobody.testnet")).is_none());
}

const VECTOR_MESSAGE_HEX: &str = "4c4f5742414c4c2d504143542d76313a07000000000000002800000003000000190000006d61726c6f772e6c6f7762616c6c2d636b2e746573746e6574180000006f64696c652e6c6f7762616c6c2d636b2e746573746e65741800000073756c6c792e6c6f7762616c6c2d636b2e746573746e65741581e97df4102211";

/// The contract's own `Pact` type must produce exactly the bytes documented in PACT_ENCODING.md.
#[test]
fn pact_message_matches_documented_vector() {
    let pact: Pact = near_sdk::serde_json::from_str(
        r#"{"season_id":7,"cap":40,"members":["marlow.lowball-ck.testnet","odile.lowball-ck.testnet","sully.lowball-ck.testnet"],"nonce":"1234567890123456789"}"#,
    )
    .unwrap();
    assert_eq!(hex::encode(pact_message(&pact)), VECTOR_MESSAGE_HEX);
    // nonce as a plain JSON number decodes to the same pact
    let n: Pact = near_sdk::serde_json::from_str(r#"{"season_id":"7","cap":40,"members":[],"nonce":5}"#).unwrap();
    assert_eq!((n.season_id, n.nonce), (7, 5));
}

#[test]
fn documented_vector_file_agrees_with_contract_constant() {
    let md = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/PACT_ENCODING.md")).unwrap();
    assert!(md.contains(&format!("message_hex: {VECTOR_MESSAGE_HEX}")));
}

/// Host-function check of the documented signature against the documented public key.
#[test]
fn documented_signature_verifies_with_ed25519_host_fn() {
    use base64::Engine as _;
    let b = base64::engine::general_purpose::STANDARD;
    as_("house.testnet", 0);
    let pk: [u8; 32] = b.decode("A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=").unwrap().try_into().unwrap();
    let sig: [u8; 64] = b
        .decode("Thhj+uQxEfWM5vARnydDOSAp3pwM2bC77qvIO1waYCFSp3GK9fxJM0uzPyGaAKNt+imkY3CaClBuq/YglsktCg==")
        .unwrap()
        .try_into()
        .unwrap();
    let msg = hex::decode(VECTOR_MESSAGE_HEX).unwrap();
    assert!(near_sdk::env::ed25519_verify(&sig, &msg, &pk));
    let mut bad = msg.clone();
    bad[20] ^= 1;
    assert!(!near_sdk::env::ed25519_verify(&sig, &bad, &pk));
}
