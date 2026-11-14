//! BRIEF-2 rules: yield leniency window, NEP-245 catch tokens, payout_evm validation.

use super::*;

macro_rules! fails {
    ($name:ident, $code:expr, $body:expr) => {
        #[test]
        #[should_panic(expected = $code)]
        fn $name() {
            let f: fn() = $body;
            f();
        }
    };
}

fails!(leniency_twice_while_open, "E_LENIENCY_OPEN", || {
    let mut c = bonded(3);
    lot_with_reveals(&mut c, &[40; 5]);
    as_("player.testnet", 0);
    c.offer_leniency(0);
    c.offer_leniency(0);
});
fails!(open_lot_zero_weight, "E_BAD_ARGS", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 0);
});
fails!(bad_evm_address, "E_BAD_EVM", || {
    let mut c = fresh(3);
    as_("house.testnet", 0);
    c.create_season(a("p2.testnet"), buyers(), 3, U128(BOND), Some("0x1234".into()));
});
fails!(bad_evm_not_hex, "E_BAD_EVM", || {
    let mut c = fresh(3);
    as_("house.testnet", 0);
    let addr = format!("0x{}", "zz".repeat(20));
    c.create_season(a("p2.testnet"), buyers(), 3, U128(BOND), Some(addr));
});
fails!(reset_by_stranger, "E_NOT_CONTRACT", || {
    as_("house.testnet", 0);
    let _ = Contract::reset(a("house.testnet"));
});

#[test]
fn good_evm_address_is_stored() {
    let mut c = fresh(3);
    as_("house.testnet", 0);
    let addr = format!("0x{}", "aB".repeat(20));
    let id = c.create_season(a("p2.testnet"), buyers(), 3, U128(BOND), Some(addr.clone()));
    let v = c.get_season(id);
    assert_eq!((v.payout_evm, v.payout_route.as_str()), (Some(addr), "none"));
}

fn escrow() -> AccountId {
    near_sdk::env::current_account_id()
}

#[test]
fn token_minted_into_escrow_then_sold_to_winner() {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Atlantic cod".into(), 100, 42);
    let tid = "s0-d1".to_string();
    assert_eq!(c.mt_balance_of(escrow(), tid.clone()).0, 42);
    assert_eq!(c.mt_balance_of(a("b1.testnet"), tid.clone()).0, 0);
    assert_eq!(c.mt_supply(tid.clone()).unwrap().0, 42);
    assert!(c.mt_supply("s0-d9".into()).is_none());
    let t = c.mt_token(vec![tid.clone(), "junk".into()]);
    assert_eq!(t[0].as_ref().unwrap().metadata.title, "42 kg Atlantic cod — season 0, day 1");
    assert!(t[1].is_none());
    assert_eq!(c.mt_tokens_for_owner(escrow(), None, None).len(), 1);
    // bids: b2 highest
    for (i, amt) in [40u32, 90, 50, 60, 70].iter().enumerate() {
        as_(&format!("b{}.testnet", i + 1), 0);
        c.commit_bid(0, commit_hash(*amt, &[i as u8; 32]));
    }
    for (i, amt) in [40u32, 90, 50, 60, 70].iter().enumerate() {
        as_(&format!("b{}.testnet", i + 1), 0);
        c.reveal_bid(0, *amt, b64(&[i as u8; 32]));
    }
    as_("anyone.testnet", 0);
    c.settle_lot(0);
    assert_eq!(c.mt_balance_of(escrow(), tid.clone()).0, 0);
    assert_eq!(c.mt_balance_of(a("b2.testnet"), tid.clone()).0, 42);
    assert_eq!(c.mt_batch_balance_of(a("b2.testnet"), vec![tid.clone(), "s9-d9".into()]).iter().map(|x| x.0).collect::<Vec<_>>(), vec![42, 0]);
    assert!(c.mt_tokens_for_owner(escrow(), None, None).is_empty());
    assert_eq!(c.mt_tokens_for_owner(a("b2.testnet"), None, None)[0].token_id, tid);
    let l = &c.get_season(0).lots[0];
    assert_eq!((l.token_id.as_str(), l.token_owner.clone(), l.weight_kg), ("s0-d1", a("b2.testnet"), 42));
    assert_eq!(c.mt_tokens(None, None).len(), 1);
    let meta = c.mt_metadata_contract();
    assert_eq!((meta.name.as_str(), meta.symbol.as_str()), ("Lowball Catch", "CATCH"));
}

#[test]
fn unsold_lot_returns_to_player_on_close() {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 15);
    assert_eq!(c.mt_balance_of(escrow(), "s0-d1".into()).0, 15);
    c.close_season(0);
    assert_eq!(c.mt_balance_of(escrow(), "s0-d1".into()).0, 0);
    assert_eq!(c.mt_balance_of(a("player.testnet"), "s0-d1".into()).0, 15);
}

fn sold_lot() -> Contract {
    let mut c = bonded(3);
    lot_with_reveals(&mut c, &[40; 5]);
    as_("anyone.testnet", 0);
    c.settle_lot(0);
    c
}

#[test]
fn mt_transfer_moves_whole_lot() {
    let mut c = sold_lot();
    as_("b1.testnet", 1);
    c.mt_transfer(a("friend.testnet"), "s0-d1".into(), U128(40), None, Some("gift".into()));
    assert_eq!(c.mt_balance_of(a("friend.testnet"), "s0-d1".into()).0, 40);
    assert!(c.mt_tokens_for_owner(a("b1.testnet"), None, None).is_empty());
}

fails!(mt_partial_amount, "E_MT_PARTIAL", || {
    let mut c = sold_lot();
    as_("b1.testnet", 1);
    c.mt_transfer(a("friend.testnet"), "s0-d1".into(), U128(10), None, None);
});
fails!(mt_not_owner, "E_NOT_TOKEN_OWNER", || {
    let mut c = sold_lot();
    as_("b2.testnet", 1);
    c.mt_transfer(a("friend.testnet"), "s0-d1".into(), U128(40), None, None);
});
fails!(mt_needs_one_yocto, "E_NEED_1_YOCTO", || {
    let mut c = sold_lot();
    as_("b1.testnet", 0);
    c.mt_transfer(a("friend.testnet"), "s0-d1".into(), U128(40), None, None);
});
fails!(mt_no_token, "E_NO_TOKEN", || {
    let mut c = sold_lot();
    as_("b1.testnet", 1);
    c.mt_transfer(a("friend.testnet"), "s0-d5".into(), U128(40), None, None);
});
fails!(mt_self_transfer, "E_SELF_TRANSFER", || {
    let mut c = sold_lot();
    as_("b1.testnet", 1);
    c.mt_transfer(a("b1.testnet"), "s0-d1".into(), U128(40), None, None);
});

#[test]
fn token_id_roundtrip() {
    assert_eq!(crate::mt::parse_token_id("s12-d3"), Some((12, 3)));
    assert_eq!(crate::mt::parse_token_id("12-d3"), None);
    assert_eq!(crate::mt::parse_token_id("s12-d300"), None);
    assert_eq!(crate::mt::token_id(7, 2), "s7-d2");
}

const CONF_MESSAGE_HEX: &str = "4c4f5742414c4c2d434f4e464553532d76313a0700000000000000190000006d61726c6f772e6c6f7762616c6c2d636b2e746573746e65741581e97df4102211";
const CONF_SIG_B64: &str = "zffnG8aMFU6LtJPvslu9/Uq+LuR5VxeAxULok6Yr9cQn04C31LIJBQBPFmGIHLto/joIuMB6OVnPGIH8jousAw==";
const CONF_PK_B64: &str = "A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=";

#[test]
fn confession_message_matches_documented_vector() {
    let m = crate::confession_message(7, &a("marlow.lowball-ck.testnet"), 1234567890123456789);
    assert_eq!(hex::encode(&m), CONF_MESSAGE_HEX);
    let md = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/PACT_ENCODING.md")).unwrap();
    assert!(md.contains(&format!("confession_message_hex: {CONF_MESSAGE_HEX}")));
    assert!(md.contains(&format!("confession_sig_b64: {CONF_SIG_B64}")));
}

#[test]
fn documented_confession_signature_verifies_and_binds_every_field() {
    use base64::Engine as _;
    let b = base64::engine::general_purpose::STANDARD;
    as_("house.testnet", 0);
    let pk: [u8; 32] = b.decode(CONF_PK_B64).unwrap().try_into().unwrap();
    let sig: [u8; 64] = b.decode(CONF_SIG_B64).unwrap().try_into().unwrap();
    let ok = |s: u64, who: &str, n: u64| near_sdk::env::ed25519_verify(&sig, &crate::confession_message(s, &a(who), n), &pk);
    assert!(ok(7, "marlow.lowball-ck.testnet", 1234567890123456789));
    assert!(!ok(8, "marlow.lowball-ck.testnet", 1234567890123456789)); // other season
    assert!(!ok(7, "odile.lowball-ck.testnet", 1234567890123456789)); // other confessor
    assert!(!ok(7, "marlow.lowball-ck.testnet", 1234567890123456790)); // other nonce
    // a confession message can never be mistaken for a pact message (different prefix)
    assert_ne!(&crate::confession_message(7, &a("x.testnet"), 1)[..16], PACT_PREFIX);
}
