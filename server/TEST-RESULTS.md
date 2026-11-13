# Test results

Command: `cd server && npm test` (vitest 3.2.4), run 2026-11-14.

```
 ✓ test/pact.test.ts (4 tests)
 ✓ test/nearai.test.ts (16 tests | 1 skipped)
 ✓ test/signer.test.ts (14 tests)
 ✓ test/api.test.ts (44 tests)
 ✓ test/engine.test.ts (20 tests)
 ✓ test/d1.test.ts (3 tests)

 Test Files  6 passed (6)
      Tests  100 passed | 1 skipped (101)
```

`npm run typecheck` is clean.

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

- **Recorded real NEAR AI response**: the one skipped test needs `test/fixtures/nearai-recorded.json`; `NEARAI_API_KEY` was not in the vault, so no real completion or signature was ever fetched. Signature verification is tested against synthetic gateway signatures that follow the documented format.
- **Real contract / real testnet transactions**: `contract/deployed.json` did not exist when this was written, so the hand-written NEAR transaction encoder has not yet been exercised against the network. See E2E-RUN.md (or its absence) for the current state.
- The Worker was started with `wrangler dev` and answered `/api/health` and validation errors; no full season ran through it.
