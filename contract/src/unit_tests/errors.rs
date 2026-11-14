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

fails!(create_non_house, "E_NOT_HOUSE", || {
    let mut c = fresh(3);
    as_("evil.testnet", 0);
    c.create_season(a("p.testnet"), buyers(), 3, U128(BOND), None);
});
fails!(create_four_buyers, "E_BAD_ARGS", || {
    let mut c = fresh(3);
    as_("house.testnet", 0);
    c.create_season(a("p.testnet"), buyers()[..4].to_vec(), 3, U128(BOND), None);
});
fails!(create_zero_days, "E_BAD_ARGS", || {
    let mut c = fresh(3);
    as_("house.testnet", 0);
    c.create_season(a("p.testnet"), buyers(), 0, U128(BOND), None);
});
fails!(create_too_many_days, "E_BAD_ARGS", || {
    let mut c = fresh(3);
    as_("house.testnet", 0);
    c.create_season(a("p.testnet"), buyers(), 31, U128(BOND), None);
});
fails!(create_zero_bond, "E_BAD_ARGS", || {
    let mut c = fresh(3);
    as_("house.testnet", 0);
    c.create_season(a("p.testnet"), buyers(), 3, U128(0), None);
});
fails!(create_duplicate_buyer, "E_BAD_ARGS", || {
    let mut c = fresh(3);
    let mut bs = buyers();
    bs[4] = bs[0].clone();
    as_("house.testnet", 0);
    c.create_season(a("p.testnet"), bs, 3, U128(BOND), None);
});
fails!(create_player_is_buyer, "E_BAD_ARGS", || {
    let mut c = fresh(3);
    as_("house.testnet", 0);
    c.create_season(a("b1.testnet"), buyers(), 3, U128(BOND), None);
});
fails!(create_unregistered_key, "E_NO_KEY", || {
    let mut c = fresh(3);
    let mut bs = buyers();
    bs[4] = a("stranger.testnet");
    as_("house.testnet", 0);
    c.create_season(a("p.testnet"), bs, 3, U128(BOND), None);
});
fails!(register_short_key, "E_BAD_KEY", || {
    let mut c = fresh(3);
    as_("b1.testnet", 0);
    c.register_buyer_key(b64(&[1; 31]));
});
fails!(unknown_season, "E_NO_SEASON", || {
    let c = fresh(3);
    c.get_season(99);
});
fails!(bond_wrong_deposit, "E_BAD_DEPOSIT", || {
    let mut c = fresh(3);
    as_("b1.testnet", BOND - 1);
    c.post_bond(0);
});
fails!(bond_twice, "E_BOND_POSTED", || {
    let mut c = fresh(3);
    as_("b1.testnet", BOND);
    c.post_bond(0);
    c.post_bond(0);
});
fails!(bond_non_buyer, "E_NOT_BUYER", || {
    let mut c = fresh(3);
    as_("stranger.testnet", BOND);
    c.post_bond(0);
});
fails!(open_lot_before_bonds, "E_BONDS_MISSING", || {
    let mut c = fresh(3);
    as_("b1.testnet", BOND);
    c.post_bond(0);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
});
fails!(open_lot_non_house, "E_NOT_HOUSE", || {
    let mut c = bonded(3);
    as_("b1.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
});
fails!(open_lot_twice, "E_LOT_OPEN", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    c.open_lot(0, "Cod".into(), 90, 40);
});
fails!(open_lot_past_days, "E_PAST_DAYS", || {
    let mut c = bonded(1);
    lot_with_reveals(&mut c, &[40; 5]);
    c.settle_lot(0);
    as_("house.testnet", 0);
    c.open_lot(0, "Cod".into(), 90, 40);
});
fails!(open_lot_bad_args, "E_BAD_ARGS", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "".into(), 100, 40);
});
fails!(commit_before_bond, "E_NO_BOND", || {
    let mut c = fresh(3);
    as_("b1.testnet", 0);
    c.commit_bid(0, commit_hash(40, &[0; 32]));
});
fails!(commit_without_lot, "E_NO_LOT", || {
    let mut c = bonded(3);
    as_("b1.testnet", 0);
    c.commit_bid(0, commit_hash(40, &[0; 32]));
});
fails!(commit_twice, "E_ALREADY_COMMITTED", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    as_("b1.testnet", 0);
    c.commit_bid(0, commit_hash(40, &[0; 32]));
    c.commit_bid(0, commit_hash(41, &[0; 32]));
});
fails!(commit_bad_hash_len, "E_BAD_ARGS", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    as_("b1.testnet", 0);
    c.commit_bid(0, b64(&[1; 31]));
});
fails!(reveal_without_commit, "E_NO_COMMIT", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    as_("b1.testnet", 0);
    c.reveal_bid(0, 40, b64(&[0; 32]));
});
fails!(reveal_wrong_amount, "E_BAD_REVEAL", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    as_("b1.testnet", 0);
    c.commit_bid(0, commit_hash(40, &[7; 32]));
    c.reveal_bid(0, 41, b64(&[7; 32]));
});
fails!(reveal_wrong_salt, "E_BAD_REVEAL", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    as_("b1.testnet", 0);
    c.commit_bid(0, commit_hash(40, &[7; 32]));
    c.reveal_bid(0, 40, b64(&[8; 32]));
});
fails!(reveal_twice, "E_ALREADY_REVEALED", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    as_("b1.testnet", 0);
    c.commit_bid(0, commit_hash(40, &[7; 32]));
    c.reveal_bid(0, 40, b64(&[7; 32]));
    c.reveal_bid(0, 40, b64(&[7; 32]));
});
fails!(settle_not_ready, "E_NOT_READY", || {
    let mut c = bonded(3);
    lot_with_reveals(&mut c, &[40, 40, 40]);
    as_("b1.testnet", 0);
    c.settle_lot(0);
});
fails!(house_settle_needs_a_reveal, "E_NOT_READY", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.open_lot(0, "Hake".into(), 100, 40);
    c.settle_lot(0);
});
fails!(leniency_non_player, "E_NOT_PLAYER", || {
    let mut c = bonded(3);
    as_("b1.testnet", 0);
    c.offer_leniency(0);
});
fails!(leniency_before_day_one, "E_NO_DAY", || {
    let mut c = bonded(3);
    as_("player.testnet", 0);
    c.offer_leniency(0);
});
fails!(withdraw_while_open, "E_SEASON_OPEN", || {
    let mut c = bonded(3);
    as_("b1.testnet", 0);
    c.withdraw_bond(0);
});
fails!(close_by_stranger_early, "E_NOT_FINISHED", || {
    let mut c = bonded(3);
    as_("b1.testnet", 0);
    c.close_season(0);
});
fails!(close_twice, "E_CLOSED", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.close_season(0);
    c.close_season(0);
});
fails!(open_lot_after_close, "E_CLOSED", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.close_season(0);
    c.open_lot(0, "Hake".into(), 100, 40);
});
fails!(withdraw_after_close, "E_ALREADY_WITHDRAWN", || {
    let mut c = bonded(3);
    as_("house.testnet", 0);
    c.close_season(0);
    as_("b1.testnet", 0);
    c.withdraw_bond(0);
});

