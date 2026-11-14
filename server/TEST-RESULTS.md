# Test results

Command: `cd server && npm test` (vitest 3.2.4), latest run 2026-11-15 01:10 IST (after NEP-413 and EIP-191 wallet sign-in,
wallet seasons, the TOO_SHORT interrogation guard and the third-person tell). Under heavy machine load one
test failed once (which one was not captured; `test/d1.test.ts` is the known timing-sensitive one); the next three runs passed.

```
 ✓ test/features-forge.test.ts (9 tests)
 ✓ test/auth.test.ts (24 tests)
 ✓ test/tee-mode.test.ts (11 tests)
 ✓ test/engine.test.ts (21 tests)
 ✓ test/tee.test.ts (10 tests)
 ✓ test/engine-upgrade.test.ts (20 tests)
 ✓ test/features-interrogate.test.ts (22 tests)
 ✓ test/tee-outlayer.test.ts (4 tests)
 ✓ test/attestation.test.ts (14 tests)
 ✓ test/pact.test.ts (4 tests)
 ✓ test/nearai.test.ts (16 tests | 1 skipped)
 ✓ test/leniency-wallet.test.ts (6 tests)
 ✓ test/real-chain.test.ts (12 tests)
 ✓ test/features-wiretap.test.ts (6 tests)
 ✓ test/features-data.test.ts (18 tests)
 ✓ test/api.test.ts (53 tests)
 ✓ test/mock-upgrade.test.ts (14 tests)
 ✓ test/signer.test.ts (15 tests)
 ✓ test/chainsig.test.ts (13 tests)
 ✓ test/chainsig-relay.test.ts (10 tests)
 ✓ test/attestation-flow.test.ts (18 tests)
 ✓ test/api-payout.test.ts (10 tests)
 ✓ test/budget.test.ts (12 tests)
 ✓ test/d1.test.ts (7 tests)
 Test Files  24 passed (24)
      Tests  348 passed | 1 skipped (349)
```

Earlier the same day (BRIEF-2 integration): 232 passed | 1 skipped across 15 files. The coverage sections below describe
what that integration added.

`npm run typecheck` is clean; `npm run smoke-sim` (scripted model, MockChain with the 200-block window) completes both modes;
`wrangler deploy --dry-run` bundles the Worker (chainsig relayer included); `npm run db:migrate` applies `0002_spend.sql`.
Before this change: 100 passed | 1 skipped (a baseline run on the new `contract/src/errors.rs` already failed 7 error-mapping
tests, now mapped: `E_LENIENCY_OPEN E_BAD_EVM E_NO_TOKEN E_NOT_TOKEN_OWNER E_MT_PARTIAL E_NEED_1_YOCTO E_SELF_TRANSFER E_NOT_CONTRACT`).

## Contract-upgrade coverage (new)

- **MockChain implements the documented contract rules**: `open_lot` weight (`E_BAD_ARGS` on 0) and `mt_mint` log; `settle_lot`
  `mt_transfer` with memo `sold at N marks`; unsold lot returned to the player on confession and close (`returned unsold`);
  `offer_leniency` opens a yield window with `open_block`/`deadline_block = open + 200`, second offer `E_LENIENCY_OPEN`,
  timeout after 200 blocks closes it and counts `holdouts`, a fresh window may then open, confess after the timeout
  `E_NO_LENIENCY`, confession resumes the yield (no holdout ever counted), next day's `open_lot` kills the window;
  `create_season` payout address `E_BAD_EVM`; `confess` in a `payout_evm` season fails without the 250 Tgas attach;
  `payout_route` `evm_pending -> evm` or `evm_failed_near` (desk failure, NEAR still recorded as the player payout).
- **RealChain over a fake JSON-RPC node**: `create_season` includes `payout_evm` only when set; `open_lot` sends `weight_kg`;
  `confess` gas 30 Tgas vs 250 Tgas; `blockHeight`; `NearSigner.send(..., 'INCLUDED')` asks the node for inclusion only;
  `verifyLeniencyTx` never sends an EXECUTED wait, polls `get_season` until the window opens and returns `deadlineBlock`, rejects a
  different signer/receiver/season/method/extra actions (`TX_MISMATCH`), unknown hash (`TX_NOT_FOUND`), a window that never opens
  (`TX_FAILED`), a receipt failure carried with the tx (`E_NOT_PLAYER`), and a window opened by an older tx.
- **Engine events**: `lot_minted` after `day_opened` (tokenId, kg, tx) and `lot_transferred` after `lot_settled` (winner account
  and buyer id, memo); none when the receipt has no log (nothing guessed); `leniency_open.deadlineBlock = open + 200`;
  `holdout{reason:'timeout'}` only after the contract closed the window (the chain's `holdouts` is 1); `holdout{reason:'no_pact'}`
  with no model call; a window that outlasts the request returns `status.finalizing`, steps are refused, and events polls
  finish it; a confession closes with no holdout.
- **Cross-chain payout**: `payout_evm{to, amountWei, sepoliaTx, nearTx}` after `slashed` and before `season_closed` (nearTx is the
  winning confess tx); no relayer call without `payoutEvm`; relayer failure and missing relayer give
  `error{PAYOUT_EVM_FAILED, retryable:true}` and no fabricated hash; desk failure gives a non-retryable honest error with the
  NEAR payout intact; a late MPC signature is finished by event polls; a reverted Sepolia tx reports `status: reverted` plus an error.
- **Species**: exactly the six with art (cod, halibut, monkfish, bluefin tuna, sea bass, lobster), values inside the prompt's range.
- **Spend caps**: price math from the catalogue, unknown model at the high fallback, usage ledger fed from `usage` (also for
  rejected replies; estimated flag when absent; a failing ledger never breaks a call), `createSession` and `POST /api/session`
  refuse with `BUDGET_EXHAUSTED` (402) at the cap and before any chain work, ElevenLabs capped per session with free cache hits,
  slot returned on upstream failure, `GET /api/tts` answers `429 TTS_LIMIT`, and the same store contract on `MemoryStore` and D1.

## What is covered

- **Pact encoding**: borsh layout; the test vector in `contract/PACT_ENCODING.md` is parsed from that file and reproduced exactly (borsh bytes, message, signature, public key).
- **Event ordering**: season/bond/cartel/rumour/day order, gapless `seq`, commit < reveal < settle, polling with `after=n`, no public `pact_signed`.
- **Flow**: full season to close; resumable `begin` and `sell` after a model or tx failure without repeating work or re-asking models; hold cap; `BUSY` lock; phase errors; case file sealed until closed.
- **Leniency**: tx verification (`TX_NOT_FOUND`, `TX_MISMATCH`), holdout, no-pact outcome, three-way confession race with one winner and `E_ALREADY_CONFESSED` for the rest, slashed list and payout, close after confession, retry after a model failure.
- **zod boundaries**: bad keys, extra fields, bad ids, bad `after`, bad `txHash`, per-IP rate limit, errors are always `{error, code}` with no stack text.
- **Nonce queue / RPC**: per-signer serialisation, parallel across signers, InvalidNonce retry, timeout then lookup without resubmitting, provider failover, JSON-RPC rate-limit (HTTP 200, code -429) failover.
- **Error mapping**: every `E_*` in `contract/src/errors.rs` (parsed from the file) maps to a safe message and round-trips through a failed receipt; no stale mappings.
- **Adversarial contract cases** (15 refusals + 1 accepted confession) on the rule-faithful `MockChain`: replay for another season, unregistered key, non-season member, duplicate signer, too few signers, own signature missing, double commit, reveal mismatch, bid before bond, open lot past last day, wrong deposit, second confession.
- **NEAR AI client** over a mocked transport: structured-output request shape, one retry on invalid JSON then `MODEL_BAD_OUTPUT`, 5xx and 401 handling, call budget, and signature verification (EIP-191 digest matches the published eth-account reference hash; ed25519; tamper and wrong-signer rejection).
- **D1**: the same store contract on `MemoryStore` and the real `D1Store` (wrangler local runtime), plus a full confession season through D1.
- **TTS**: ElevenLabs proxy, cache hit/miss, failure mapping.

## What is NOT covered (and why)

- **Recorded real NEAR AI response**: the one skipped test still needs `test/fixtures/nearai-recorded.json`. Real completions
  and their signatures are checked live instead: each season's case file reports model receipts verified (26/26 in season 46,
  14 Nov), and `npm run verify-attestation -- --live` re-checks the attestation.
- **Real testnet behaviour is verified outside this suite**, in recorded runs rather than automated tests: live seasons on the
  deployed Worker (season 46: a confession, four slashes, a second confession refused, five signatures re-checked in the
  browser, three forgery-drill refusals), `sim/ADVERSARIAL-REAL.md` (18 of 18 refusals on the deployed contract) and
  `FEATURES-RUN.md`. The suite itself still uses a fake JSON-RPC node and the rule-faithful MockChain.
- **Cross-chain leg**: the relayer is unit-tested in `chainsig-relay.test.ts`; one real Sepolia payout is recorded
  (`0x92fbe20e…610c`). No suite test broadcasts to Sepolia.
- **OutLayer enclave mode**: covered with fakes in `tee-outlayer.test.ts` and `tee-mode.test.ts`. Live, one enclave season was
  accepted (season 32); the testnet executor pool has been unreliable since, so seasons fall back to standard mode.
- **D1 spend ledger under concurrency**: single-writer tests only; the cap can be overshot by in-flight seasons (a season costs cents).
- The Worker was started with `wrangler dev` and answered `/api/health` and validation errors; no full season ran through it.
