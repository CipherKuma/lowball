# Lowball — brief 2: NEAR depth upgrades (agent contract; terse)

Deadline 2026-11-14T23:59Z. Everything below must land, be tested and be deployable by
**2026-11-14 17:30Z** (23:00 IST) so integration + demo video fit. Testnet only. Same git rules
as BRIEF.md (explicit paths, persona identity untouched, Claude-Session trailer).

## Accounts (testnet)
`lowball-ck.testnet` (game contract), `lowball-house-ck.testnet` (house/server). Created by the
integrator after the faucet unlock (~06:35Z). Subaccounts you need: create them **from these
accounts** (never from any other testnet account in ~/.near-credentials). Keys stay in
~/.near-credentials; never print or commit keys.

## U1 — On-chain leniency clock (NEP-519 yield/resume) — owner: contract agent
- `offer_leniency(season_id)` (player only) now calls `env::promise_yield_create` with callback
  `on_leniency_end(season_id)` (#[private]); store `leniency_data_id`, `leniency_open_block`.
- First successful `confess` → `env::promise_yield_resume(data_id, payload{"confessor"})`, so
  the callback settles immediately. No confession within the yield timeout (200 blocks) →
  callback runs with timeout → window closes, `holdout_count += 1`, emits event `holdout`.
- One window per day; a new `offer_leniency` while open → `E_LENIENCY_OPEN`.
- Views add: `leniency_open_block`, `leniency_deadline_block` (= open + 200), `holdouts`.
- Events: NEP-297 `EVENT_JSON:{"standard":"lowball","version":"1.0.0","event":...}` for
  `leniency_open`, `confession`, `slash`, `holdout` (data includes season_id, accounts, yocto).
- Tests: sandbox fast-forward past 200 blocks → holdout; confess inside window → resume; double
  resume safe; confess after timeout → `E_NO_LENIENCY`.

## U2 — Fish as tokens (NEP-245 multi-token) — owner: contract agent
- Contract is a NEP-245 MT contract. `open_lot` mints token id `s{season}-d{day}` with
  amount = weight_kg to the **contract escrow on behalf of the player** (record `escrow_owner`).
- `settle_lot` transfers the lot from escrow to the winning buyer (`mt_transfer` semantics,
  emits standard NEP-245 `mt_transfer` event with memo `"sold at <price> marks"`).
  No winner → returned to player (`mt_transfer` to player).
- Implement NEP-245 views: `mt_balance_of`, `mt_batch_balance_of`, `mt_token`, `mt_supply`,
  `mt_tokens_for_owner` + metadata (`mt_metadata_contract`: name "Lowball Catch", symbol
  "CATCH"; token metadata title "42 kg Atlantic cod — season 7, day 2"). Emit standard
  `mt_mint` / `mt_transfer` events (NEP-245 event format).
- `open_lot` signature gains `weight_kg: u32` (server already knows weight).
- Tests: balances after mint/transfer, events JSON shape, return-to-player path.

## U3 — Cross-chain payout via Chain Signatures — owner: chainsig agent
- New crate `contracts/payout-desk/` deployed at `desk.lowball-ck.testnet`.
- Game contract: `create_season(..., payout_evm: Option<String>)` stores a 0x address; on
  confession, if `payout_evm` is set, instead of transferring NEAR to the player it calls
  `desk.pay_evm({season_id, to, amount_yocto})` attaching the slashed NEAR (contract agent adds
  this call + test with a mock desk; chainsig agent owns the desk).
- Desk: builds an EIP-1559 Sepolia tx from its MPC-derived address (path `lowball-desk-v1`)
  paying `amount_wei = amount_yocto * RATE` (fixed testnet rate in config, e.g. 0.2 NEAR →
  0.0002 ETH), calls the testnet MPC signer (`v1.signer-prod.testnet`, check docs) `sign`, and
  records `{season_id, tx_unsigned_hex, big_r, s, recovery_id}`; view `get_payout(season_id)`.
- Relayer in `server/src/chainsig/*`: reads the signature, assembles the signed tx, broadcasts
  to Sepolia RPC, records the Sepolia tx hash; emits game event
  `payout_evm{to, amountWei, sepoliaTx, nearTx}` (additive to shared/api.ts).
- Funding the derived Sepolia address: report the address + how much test ETH is needed; the
  integrator funds it. Never fake a Sepolia hash.

## U4 — OutLayer TEE buyer keys — owner: outlayer agent (2 h go/no-go spike FIRST)
- Goal: a buyer's pact signing key lives in an OutLayer TDX job (sealed via CKD), the job calls
  NEAR AI Cloud and signs the buyer's decision; the contract registers the TEE-derived key.
- Spike gates (stop and report if any fails within 2 h): one real testnet job runs; it makes an
  HTTPS call; it signs with a key whose public key is stable across two runs; attestation of
  the job is retrievable. If all pass, implement for **one** buyer first (Sully), behind config,
  then all five. Write `outlayer/` + `research/outlayer-spike.md` with real outputs only.

## UI events the integrator needs (server emits; additive to shared/api.ts)
`leniency_open{tx, deadlineBlock}`, `holdout{reason:'timeout'|'no_pact'}`,
`lot_minted{tokenId, amount, tx}`, `lot_transferred{tokenId, to, tx}`,
`payout_evm{to, amountWei, sepoliaTx, nearTx}`, `tee_signed{buyer, jobId, attestationUrl}`.
