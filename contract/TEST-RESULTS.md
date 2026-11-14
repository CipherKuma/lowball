# Contract test results (real output, 2026-11-14, after BRIEF-2 U1/U2/U3-game-half)

Wasm under test: `contract/target/near/lowball.wasm` (288 KB), sha256
`f28eab7a9da10a03f72fc197fd95907bdca06c866a825aa8f5b50b3f0fe6dd88` (`contract/build.sh`: Rust 1.86 + `--cfg near`).
Mock desk for the payout tests: `contract/mock-desk/build.sh` (test double only, never deployed). Sandbox: near-sandbox
2.13.4 via near-workspaces 0.23.

Totals: **61 unit + 26 sandbox = 87 passed, 0 failed.** (After U1-U3: 59 + 24 = 83; originally 44 + 11 = 55.)
Wasm after U5 (confession_sig): sha256 `4cb3ff89784f3dbe4a357178af15012652eb3f5fde235e8bb9b3ab78897be863`.

### U5: confession signature
- Unit: documented vector message equals `confession_message(7, marlow..., nonce)`; the documented signature verifies and
  fails for another season, another confessor, another nonce.
- Sandbox `confess_errors.rs::confession_signature_matrix`: missing, 63-byte, unregistered key, another buyer's valid
  signature, wrong season, wrong nonce, wrong confessor name, replay of a valid signature from season A in season B (with a
  correctly signed pact for B) all give `E_BAD_CONFESSION_SIG` and change no state; the right signature confesses only its
  own season; order checks (`E_BAD_SIG` before it, `E_TOO_FEW` after it). `vector.rs::confession_vector_matches` recomputes
  the PACT_ENCODING.md vector. All previous confess tests now pass a valid `confession_sig`.
- One flaky run: `cost.rs` hit a sandbox "connection refused" under 4 parallel test threads and passed on rerun alone.


## Unit tests: `cd contract && cargo test`

```
running 59 tests
test result: ok. 59 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.06s
```

New in `src/unit_tests/u123.rs`: `E_LENIENCY_OPEN`, zero-weight lot (`E_BAD_ARGS`), `E_BAD_EVM` (length and non-hex),
`reset` by a stranger (`E_NOT_CONTRACT`), token minted into escrow then sold to the highest bidder (balances, batch
balances, supply, `mt_token` title, `mt_tokens_for_owner`, `mt_tokens`, contract metadata), unsold lot returned to the player
on close, whole-lot `mt_transfer` plus `E_MT_PARTIAL`, `E_NOT_TOKEN_OWNER`, `E_NEED_1_YOCTO`, `E_NO_TOKEN`,
`E_SELF_TRANSFER`, token-id round trip. The old idempotent-leniency test became "window closes on the next day and reopens".

## Sandbox integration tests: `cd contract/it && cargo test -- --test-threads=4`

```
tests/admin.rs         1 passed   reset_is_contract_only_and_wipes_state
tests/confess_errors.rs 2 passed  confess_error_matrix, key_rotation_does_not_affect_running_season
tests/cost.rs          1 passed   full_season_storage_and_gas
tests/flows.rs         7 passed   (race x2, exact accounting, non-signer withdraw, honest season, permissions, config)
tests/leniency.rs      4 passed   (U1)
tests/payout.rs        4 passed   (U3 game half, mock desk)
tests/tokens.rs        4 passed   (U2)
tests/vector.rs        1 passed   pact_encoding_vector_matches
```

### U1 (leniency clock, real blocks): `tests/leniency.rs`

- `offer_exposes_deadline_and_blocks_a_second_window`: `leniency_open_block`, `leniency_deadline_block = open + 200`,
  second offer while open fails `E_LENIENCY_OPEN`.
- `timeout_records_holdout_then_confession_is_refused`: `fast_forward(220)` -> yield timeout callback ran, `holdouts == 1`,
  window cleared, `confess` -> `E_NO_LENIENCY`; the offer tx result then carries the `leniency_open` and `holdout` events
  (`reason: "timeout"`); a second window the same day opens and a confession inside it succeeds.
- `confession_resumes_the_yield_and_no_holdout_follows`: confess inside the window -> `confession` + `slash` events, window
  cleared by the resume callback within a few blocks (no 200-block wait), second confession `E_ALREADY_CONFESSED`, and after
  another 220 blocks `holdouts` is still 0 (double resume / late timeout is harmless).
- `next_day_supersedes_old_window_and_close_cancels_pending`: day 2 opens with day 1's yield pending: confess
  `E_NO_LENIENCY`, fresh window allowed; closing the season then fast-forwarding past both timeouts counts no holdout.

Finding recorded in INTERFACE.md: the `offer_leniency` transaction is not final until the yield resolves, so a blocking
`broadcast_tx_commit` / wait-until-`EXECUTED` hangs; near-workspaces timed out after ~30 s and retried with a new nonce
(`E_LENIENCY_OPEN`). Tests use `transact_async` and read the view. Clients must wait for `INCLUDED_FINAL` or poll
`get_season`.

### U2 (NEP-245): `tests/tokens.rs`

- Exact event JSON: `mt_mint` (owner = contract, memo `escrow for <player>`, amounts `["42"]`) on `open_lot`;
  `mt_transfer` (escrow -> winner, memo `sold at 90 marks`) on `settle_lot`; user `mt_transfer` with 1 yocto and its memo.
- Balances/views after mint and transfer (`mt_balance_of`, `mt_batch_balance_of`, `mt_supply`, `mt_token`,
  `mt_tokens_for_owner`, `mt_metadata_contract` = "Lowball Catch"/"CATCH", title "42 kg Atlantic cod — season N, day 1").
- Return-to-player: unsold open lot at `close_season` and at a confession (`returned unsold`).
- Errors: `E_NOT_TOKEN_OWNER`, `E_MT_PARTIAL`, `E_NEED_1_YOCTO`; zero weight `E_BAD_ARGS`; missing `weight_kg` rejected.

### U3 game half: `tests/payout.rs` (mock desk deployed at `desk.<contract>`)

- Confession in a `payout_evm` season: desk receives exactly the slashed sum (2 bonds) with the `pay_evm` args recorded
  (`to`, `amount_yocto`, caller = game contract); player receives no NEAR; `payout_route = "evm"`; `slash` and
  `payout_route` events.
- Desk panics: slashed NEAR comes back and is paid to the player, `payout_route = "evm_failed_near"`.
- No desk account at all: same fallback.
- `E_BAD_EVM` for short, over-long and non-hex addresses; default (no `payout_evm`) still pays the player in NEAR;
  `set_desk` house-only.
- Balance deltas allow up to 0.03 NEAR: the player is also refunded the unused 10 Tgas of the resolved yield callback
  (about 0.011 NEAR) that their `offer_leniency` prepaid.

### Carried over (all still green)

Every error code of BRIEF.md in the sandbox matrix, forged/replayed/unregistered-key/duplicate-signer pacts, exact balance
accounting, confession races (2 and 3 concurrent txs: one wins, the rest `E_ALREADY_CONFESSED`), commit/reveal rules,
non-house and non-player calls, the PACT_ENCODING vector (encoding unchanged).

## Storage and gas (cost.rs, 20-day season)

```
season_create_bytes=443 season_create_near=0.0044 full_20_day_bytes=2474 full_20_day_near=0.0247 confess_5_sigs_tgas=6.7
```

About 0.025 NEAR of storage staking per 20-day season (now includes weight, owner and token index). Confession with five
verified signatures: 6.7 Tgas (no desk). With `payout_evm`, attach at least 250 Tgas (the confess forwards up to 200 Tgas to
the desk).

## Not covered / limits

- (superseded by deploy record below) Testnet: not deployed yet (accounts `lowball-ck.testnet` / `lowball-house-ck.testnet` did not exist on chain at hand-back
  time; see deploy status in the hand-back). `scripts/deploy-contract.sh` is syntax-checked and its account-detection path
  was exercised against testnet RPC; the redeploy/`reset` branch was exercised only as the `reset` method in the sandbox
  (`admin.rs`), not as a live `near` CLI sequence.
- The real payout desk (`contracts/payout-desk`) is not part of these tests; the mock only fixes the call shape
  `pay_evm(season_id, to, amount_yocto)` payable.
- The yield timeout is protocol-fixed at 200 blocks; the sandbox matches mainnet/testnet here, but wall-clock time per block
  differs (testnet about 1 s).
- Stale-season close (3 days idle) is still unit-tested with a mocked timestamp only.
- Failed refund transfers (deleted recipient account) are not handled by callbacks.
- `mt_transfer_call`, approvals and partial-amount transfers are not implemented (indivisible lots).

## Deploy record (U5, 2026-11-14 07:34 UTC)

`lowball-ck.testnet` redeployed with the U5 wasm: code hash `6ARBEDbSDzshagWAN58EYrmsHvj21he89goibjkfjFYN` (= base58 sha256 of
`contract/target/near/lowball.wasm`), deploy tx `ADGTScayMBmq4ELo7fHL61vmco5nrK9LvQ6X7fLkPzaY` (an earlier identical deploy
tx `ESWnawXGLmt7mQb6Nt5EiSVtQWrTVwxHfNVR62c7jz4D` landed while the script was fighting RPC rate limits). The state layout did
not change in U5, so no `reset` ran: `get_config` still reports `season_count: 10` and **buyer keys and old seasons survived**
(`reset` should also keep buyer keys, since storage under the same prefixes is not deleted; reasoned, not tested. Season ids
restart at 0 and overwrite old seasons; re-register keys anyway if in doubt). Existing seasons carry their key snapshots, so a
confession there now also needs `confession_sig` from that snapshot key.
