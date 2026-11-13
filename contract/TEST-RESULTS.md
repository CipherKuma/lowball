# Contract test results (real output, 2026-11-13/14)

Wasm under test: `contract/target/near/lowball.wasm`, sha256 `95431c2e623fcc6a7933533da121f6ca39c33d4d09c228eb2a2d325c443200c6`
(`contract/build.sh`: Rust 1.86 + `--cfg near`, wasm-opt -Oz). Sandbox: near-sandbox 2.13.4 via near-workspaces 0.23.

## Unit tests: `cd contract && cargo test`

```
running 44 tests
test result: ok. 44 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.22s
```

(44 = 38 error-code/rule tests + settle/tie/shortfall/leniency-window/stale-close/views + 3 pact-vector tests including
`ed25519_verify` of the documented signature.)

## Sandbox integration tests: `cd contract/it && cargo test -- --test-threads=2`

```
     Running tests/confess_errors.rs
running 2 tests
test key_rotation_does_not_affect_running_season ... ok
test confess_error_matrix ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 34.84s
     Running tests/cost.rs
test full_season_storage_and_gas ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 101.56s
     Running tests/flows.rs
running 7 tests
test confession_race_three_concurrent_txs ... ok
test confession_exact_accounting ... ok
test confession_race_two_concurrent_txs ... ok
test get_config_and_unknown_season ... ok
test non_signer_can_withdraw_after_confession ... ok
test honest_season_refunds_everyone_exactly ... ok
test permissions_and_bid_rules_on_chain ... ok
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 63.70s
     Running tests/vector.rs
test pact_encoding_vector_matches ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Totals: 44 unit + 11 sandbox = 55 passed, 0 failed.

## What the sandbox tests cover

- `confess_error_matrix`: E_NO_LENIENCY, E_NOT_BUYER, E_SEASON_MISMATCH, replay of a pact signed for another season
  (E_SEASON_MISMATCH, and E_BAD_SIG once season_id is rewritten), E_NOT_MEMBER (non-season account in members, caller not
  in members, signer not in members, signature from a non-season account), E_DUP_SIGNER (signature and member), E_BAD_SIG
  (tampered cap, unregistered key, 63-byte signature, swapped key), E_TOO_FEW (caller only, caller missing, none).
- `confession_exact_accounting`: player balance rises by exactly 3 bonds (slashed sum); slashed buyers and the non-signer
  untouched until close; confessor refunded one bond minus its own gas; at close the non-signer gets exactly one bond and
  slashed buyers nothing; E_ALREADY_CONFESSED, E_SEASON_OVER, E_SLASHED, E_ALREADY_WITHDRAWN, E_CLOSED.
- `confession_race_two/three_concurrent_txs`: concurrent `confess` txs submitted with `transact_async`; exactly one
  succeeds, the rest fail with E_ALREADY_CONFESSED, state shows the winner. (The sandbox may place them in adjacent
  blocks rather than literally the same block; the contract-level guarantee is serial execution per account state.)
- `honest_season_refunds_everyone_exactly`: E_SEASON_OPEN on withdraw while open, E_PAST_DAYS, anyone closes after the
  last lot, every buyer refunded exactly one bond.
- `permissions_and_bid_rules_on_chain`: E_NOT_HOUSE (create_season/open_lot), E_NO_BOND, E_BONDS_MISSING, E_BAD_DEPOSIT,
  E_NOT_PLAYER (buyer and house), E_NO_DAY, E_LOT_OPEN, E_ALREADY_COMMITTED, E_NO_COMMIT, E_BAD_REVEAL (amount and salt),
  E_ALREADY_REVEALED, E_NOT_READY, E_NOT_FINISHED, house force-settle with a partial reveal set.
- `key_rotation_does_not_affect_running_season`: keys are snapshotted at `create_season`.
- `pact_encoding_vector_matches` and unit `pact_message_matches_documented_vector`: `PACT_ENCODING.md` vector (borsh
  bytes, message, signature) recomputed from the secret key; also confirmed independently with Node `crypto`.
- Error codes only reachable in unit tests (also asserted there): E_BAD_ARGS, E_NO_SEASON, E_NO_KEY, E_BAD_KEY,
  E_BOND_POSTED, E_NO_LOT.

## Storage and gas (cost.rs, 20-day season, sandbox ids)

```
season_create_bytes=424 season_create_near=0.0042 full_20_day_bytes=1504 full_20_day_near=0.0150 confess_5_sigs_tgas=4.6
```

Roughly 0.015 to 0.04 NEAR of storage staking per 20-day season (longer testnet account ids add a little); the contract
account (house-funded) holds it. Confession with five verified ed25519 signatures burns about 4.6 TGas.

## Not covered / limits

- Testnet deployment: not done (faucet 429 for this IP until about 2026-11-14 06:32 UTC; integrator is funding the accounts).
- Stale-season close (3 days idle) is unit-tested with a mocked block timestamp, not in the sandbox.
- Failed refund transfers (a deleted recipient account) are not handled by callbacks; the NEAR stays in the contract.
