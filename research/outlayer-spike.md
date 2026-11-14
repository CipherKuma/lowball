# OutLayer spike for Lowball (U4): verdict GO

Run 2026-11-14, 06:35Z to 07:06Z, NEAR testnet, account `outlayer.lowball-house-ck.testnet` (the one subaccount allowed).
Every value below was returned by a real run; raw outputs are in `outlayer/evidence/`. Nothing here is simulated except
where a row says "mock".

## Verdict

**GO.** A buyer's pact key can live in an OutLayer Intel TDX job. The key is derived inside the TEE, is stable across
runs, signs the exact bytes the Lowball contract verifies, and every run has a TDX quote that independently verifies
(`outlayer-verify`: PROVEN on all five layers). Not yet exercised: the real NEAR AI Cloud completion (no API key
available to this agent; the sealed-secret path and the authenticated HTTPS call are proven with a dummy key).

## Gates

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Real OutLayer job on testnet | PASS | tx `3gWLwoM9Luoj8MggV38XyA61iXhPF5kUQoYcpbkCqk28` (request_id 43032, task 103483) on `outlayer.testnet` |
| 2 | Outbound HTTPS from the job | PASS | `GET https://cloud-api.near.ai/v1/models` returned HTTP 200, 65690 bytes, sha256 `a95e1981...`, model `z-ai/glm-5.3-flash` listed. Also an authenticated `POST /chat/completions` with a sealed dummy key returned HTTP 401 from NEAR AI (tx `Dae3QVH4...`), so the real call path works end to end up to the key |
| 3 | Signing key, stable public key across two runs | PASS | see key table. Same key in 3 consecutive runs of one binary; also stable for the 2nd binary and the final binary |
| 4 | Attestation retrievable | PASS | `GET https://testnet-api.outlayer.ai/attestations/by-tx/<tx_hash>` returns `tdx_quote` (6.6 KB), `worker_measurement`, `wasm_hash`, `executed_wasm_sha256`, `input_hash`, `output_hash`, `request_id`, `task_id`, `caller_account_id`, `transaction_hash`, `timestamp`. `outlayer-verify tx <hash> --network testnet` returns PROVEN |

### Key stability (gate 3)

| Build (sha256 prefix) | Run | tx | public key (ed25519, hex) |
|---|---|---|---|
| `5685f429` (first spike build) | run1 | `3gWLwoM9Luoj8MggV38XyA61iXhPF5kUQoYcpbkCqk28` | `6dffdec5c6d7943a1148a7434e9a9840e3e7be19727d23265c97d2e3de1b59d1` |
| `5685f429` | run2 | `49UfA2bnttS1CERtnpnMfPiJCBf36XTwWRyGYg9nXAwG` | `6dffdec5...59d1` (identical) |
| `5685f429` | run3 (with sealed secret) | `EsRL92uHaGoLuGgBt5Nz3fCCVnWhKUPWY1Z7Do5aAe3v` | `6dffdec5...59d1` (identical) |
| `737dfa80` (mock) | decide x2 | `A3MCLVbe...`, `5QiDtVxe...` | `e9383e8598b3da7fe1daded7ccc5165c9f322ac519255fea9553d91378c7a275` both |
| **`90b55c84` (current Sully build)** | probe x2 | `8ZdsCrCCewf8wJotGMdi2pGwTbjKEmK9zZnpfL2hSShu`, `8L4hx7fF1L9QEho95YuU5X4VhMc6ocD6Znqs9hWKRqdJ` | `53786ef79ef232c97c4e3266e662a6bb275d0c58e12a530dde61d62b06551902` both |

Signatures were checked offline with `outlayer/verify.mjs` (Node crypto, no dependency): canary signatures VALID for
run1, run2 and final1.

### The signature the contract will verify (the point of the whole thing)

Mock build `d6ddc514` (same code, model call replaced by a fixed "sign"), tx `5UiuaP2NPGXCPP4hy85xLmbfVLXxtH96cVQthz2YxL9C`,
key `dd5e2ff0aed423fd6d5ffb1cbc73ad70e5a963b484208ea00bcafc4dad1788ff`. Input pact is the vector from
`contract/PACT_ENCODING.md`. The TEE signature over `LOWBALL-PACT-v1:` ++ borsh(pact) verifies VALID against the vector's
`message_hex` using the TEE public key (the unit test `pact_message_matches_contract_vector` also pins the encoding). The
decision receipt signature (separate prefix `LOWBALL-DECISION-v1:`) is VALID too. The same mock run was proven by
`outlayer-verify` with input and output bytes recovered from chain (PROVEN, `evidence/verify-decide-mock.txt`).

### Sealed secret path and fail closed

* `outlayer secrets set '{"NEARAI_API_KEY":"<dummy>"}' --wasm-hash <sha> --access whitelist:<house>` stored a row.
  A `probe` run with `--secrets-profile default --secrets-account <owner>` reported `has_api_key: true` (tx `EsRL92uH...`).
* With the dummy key `decide` returned `{"ok":false,"error":"NEAR AI Cloud http 401"}` and no signature (tx `Dae3QVH4...`).
* Caller gate: a build that only allows `somebody.else.testnet` returned
  `caller "outlayer.lowball-house-ck.testnet" is not allowed to request decisions` and no signature
  (`evidence/decide-caller-denied-output.txt`, tx `BaAebaC8...`). The caller comes from the host
  (`NEAR_USER_ACCOUNT_ID`), never from the input.

## Cost

| Item | Amount |
|---|---|
| Net testnet spend for the whole spike (about 25 txs incl. 8 wasm uploads of 0.45 to 0.48 MB, 1 secret row) | about 0.06 NEAR (subaccount 2.0 to 1.94) |
| Per decision job | `estimate_execution_cost` for 1e9 instr / 128 MB / 60 s = **0.0070001 NEAR** attached, unused part refunded (the 10 s CLI default is 0.0020001) |
| OutLayer payment key / sign-up / USD | none needed: on-chain `request_execution` with NEAR only |
| NEAR AI Cloud | its own key; about $0.0003 per decision at GLM 5.3 Flash rates (server/MODELS.md) |

## What is built (`outlayer/`)

| File | Purpose |
|---|---|
| `src/main.rs`, `src/logic.rs` | WASI P2 job. Ops `probe` and `decide`. Pact encoding pinned to the contract vector, input validation, caller gate, prompt, reply parser. 4 unit tests (`cargo test --release`) |
| `manifest.json` | signing key `pact` (ed25519, `bind: wasm`, `caller: none`); network allowlist `cloud-api.near.ai` only |
| `build.sh` | one wasm per buyer, buyer id compiled in (`./build.sh all` for five) |
| `ol.sh` | OutLayer CLI with an isolated HOME and a working testnet RPC (`OUTLAYER_RPC_URL`); copies the key from `~/.near-credentials` without printing it |
| `txout.mjs` | reads a job's output from its finished tx (the CLI's own wait often times out, see risks) |
| `verify.mjs` | offline ed25519 verify of a returned signature |
| `request.example.json` | exact `request_execution` arguments for the server |
| `evidence/` | outputs, `outlayer-verify` reports, evidence bundles (re-check offline: `outlayer-verify bundle <file> --offline`) |

Design choices: `bind: wasm` + `caller: none` makes the key belong to exactly this binary and be the same for every
caller, so no project deploy (0.1 NEAR) and no per-caller keys. One buyer = one binary = one key. The module signs only
messages it composes from parsed, validated fields (never caller bytes): the pact message only when the model says `sign`,
plus a receipt over `LOWBALL-DECISION-v1:buyer|season|round|decision|sha256(context)|completion_id|sha256(pact_message)`.
The model id and API base are constants, not environment.

## Setup for the integrator (exact steps)

All on testnet. `OUTLAYER_BIN` = the `outlayer` CLI (v0.2.3, `curl -fsSL https://raw.githubusercontent.com/out-layer/outlayer-cli/main/install.sh | INSTALL_DIR=<dir> sh`).

1. Freeze the code. The key is bound to the binary hash: any source change (even a comment) changes the key. Build once
   (`cd outlayer && ./build.sh`; `./build.sh all` for five), record the sha256. Same source gives the same sha256.
2. `./ol.sh login-from-near-credentials outlayer.lowball-house-ck.testnet`
3. Upload: `OUTLAYER_RPC_URL=https://test.rpc.fastnear.com ./ol.sh upload out/lowball-buyer-sully.wasm`. **Then check**
   `curl -s -o /dev/null -w '%{http_code} %{size_download}\n' <FastFS URL>` is `200` and the file size. A job against a
   URL that is not fully there fails with `wasm_url could not be fetched` and returns `null` (happened once here).
4. **Sealed NEAR AI key** (the one step this agent did not do; do it yourself so the key never passes through an agent log):
   `./ol.sh secrets set '{"NEARAI_API_KEY":"<key>"}' --wasm-hash <sha256> --access whitelist:<account that signs request_execution>`
   Without `--access` a new hash row admits every caller. The row is readable only by that exact binary and only by the
   whitelisted caller. Repeat per buyer binary (one row per hash). Use the same account as `secrets_ref.account_id`.
5. Bootstrap each buyer: run `{"op":"probe","nonce":"boot"}` once (jobs below), keep `public_key_b64` and the tx hash.
6. Register: the buyer account calls `register_buyer_key(public_key = <public_key_b64>)` (the contract already takes
   base64 of 32 bytes).

## Integration plan

### Contract
No change needed: `register_buyer_key` already takes the ed25519 key, `confess` already verifies `ed25519_verify` over
`LOWBALL-PACT-v1:` ++ borsh(pact). Optional, additive: store the bootstrap `tee_attestation_tx` next to the key so the
Case File can link it.

### Server (TypeScript, `server/`; owner: server agent)
1. Per buyer on a season: build the `Pact` JSON (`season_id`, `cap`, `members`, `nonce` as a string) and call a job with
   `{"op":"decide","season_id","round","buyer_account","pact_json","decision_context"}` (`decision_context`: payoffs and
   history, at most 8 KB, JSON). Five buyers = five txs, parallelisable.
2. Call: sign `outlayer.testnet.request_execution` with the whitelisted account, args as in `outlayer/request.example.json`
   (`resource_limits.max_execution_seconds: 60`, gas 300 Tgas, deposit about 0.0070001 NEAR, refunded in part).
   **Do not wait with `broadcast_tx_commit`**: public RPCs time out while the job still completes (seen repeatedly).
   Send the tx, then poll the `tx` RPC with `wait_until: FINAL` and read `status.SuccessValue` (base64 JSON), as
   `outlayer/txout.mjs` does. Typical time from send to result here: 25 to 60 s. Use an RPC with a real rate limit.
3. Result handling: `ok:false` or `null` means no decision (fall back to the existing server-signed path behind config,
   and say so in the UI). `decision:"sign"` carries `signature` (base64, goes into `confess` as the buyer's `PactSig`)
   and `receipt` (verify with the returned `public_key_b64`; keep it for the Case File). `refuse` has `signature: null`.
4. Emit `tee_signed{buyer, jobId: run.request_id, attestationUrl: https://testnet-api.outlayer.ai/attestations/by-tx/<tx>}`.
   Re-check at least once per build with `outlayer-verify tx <tx> --network testnet --api https://testnet-api.outlayer.ai`
   (PROVEN) and show the verdict in the Case File.

## Risks and what this does not prove

* **Operator trust.** OutLayer's own docs say its DAO holds a full-access key able to request the shared master outside an
  enclave, a single owner approves builds, and contracts upgrade without a delay. So "nobody can ever derive a buyer's key"
  is not established; what is established is that neither the house server nor the player can, and that every signature
  is tied to an attested run of a known binary. Say this plainly in the demo and README.
* **House steers the context.** `decision_context` is supplied by the house, so a hostile house could try to talk the model
  into "sign". The receipt binds `sha256(context)` and the model completion id, and the Case File should show the context
  the buyer saw. The caller gate stops third parties (verified), not the house itself.
* **Real model output not seen.** GLM 5.3 Flash behaviour with `json_object` replies, latency and the `reasoning` field
  are untested without a key. The parser tolerates prose or fences around the JSON and fails closed.
* **Key changes with the binary.** Freeze before registering keys, or move to a project (`bind: project`, 0.1 NEAR
  deploy, HTTPS or `Project` source) so upgrades keep the key; not done.
* **Public RPC rate limits.** `rpc.testnet.near.org` is deprecated (429); the OutLayer CLI defaults to a rate-limited
  endpoint. The CLI's `run` reports "timeout" while the job completes and re-running it creates duplicate jobs.
* **Not tested:** access denial for a non-whitelisted account on the secret row (needs a second account), five-buyer
  runs, jobs in parallel, `outlayer-verify` against a mainnet. The TEE proves the code ran; it does not prove the model
  inside NEAR AI Cloud (that is the separate attestation in `server/MODELS.md`).
