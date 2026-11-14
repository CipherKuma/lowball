# OutLayer TEE buyers: integration record (U4, step 2)

Real outputs from a local Worker season on NEAR testnet, 2026-11-14 10:03Z to 10:07Z, `TEE_BUYERS="1"`, contract
`lowball-ck.testnet`. Raw files in `outlayer/evidence/` (`E2E-RUN.tee.md` is the full run report with every tx hash).

## What is TEE-signed

| Act | Who signs | What the enclave composes and signs | Contract check |
|---|---|---|---|
| Pact | each buyer's own OutLayer job (Intel TDX), key `pact` derived by the keystore (bind wasm, caller none) | `LOWBALL-PACT-v1:` ++ borsh(pact), only if the model inside the job answers `sign` | `confess` verifies it against the key registered with `register_buyer_key` |
| Confession | the same job, `deliberate` op | `LOWBALL-CONFESS-v1:` ++ borsh(season_id, confessor, pact_nonce), only if the model answers `confess`, and only on a pact whose signature by this same key the job checked first | `confession_sig` in `confess` (`E_BAD_CONFESSION_SIG`) |

Daily bids stay direct NEAR AI calls in the Worker. The server holds no pact key that matters in this mode and never
falls back to one: a failed job is `error{TEE_UNAVAILABLE, retryable:true}`. The model inside the job is
`Qwen/Qwen3.6-35B-A3B-FP8` (thinking off, strict json_schema); the prompts are the server's own
`system()`/`cartelPrompt()`/`deliberatePrompt()`, passed as job input. The job returns the NEAR AI chat id, request and
response hashes and the provider's signature over them (fetched inside the job); the Worker re-checks the text and the
ECDSA signature (`true/true` for all ten jobs).

## The season (season 32, player `pja5v98.lowball-house-ck.testnet`)

* 5 pact jobs (parallel): all signed, all first attempt. 5 deliberation jobs (parallel): sully confessed, four stayed quiet.
* `confess sully`: tx `2Ad3j5Xk6kRE1qCMTF3rU8qSGSUW7P54fBnyvuxzaBuu`, accepted by the contract with the TEE
  `confession_sig`. On-chain after: `status Closed`, `first_confessor sully.lowball-house-ck.testnet`, 5 verified signers,
  `slashed_total` 0.4 NEAR, `player_payout` 0.4 NEAR, `payout_route near`.
* `offer_leniency` (player key): `FmAGUEzVEcBnQGnrXZiWTkJ7gLxqusNXeGKA9bPWoMRq`. `create_season`: `DrCzkBbbjfFFdbzd322Qz6UzJdKTNqaM3SHv9AKuj1VN`.
* Registered TEE keys (get_buyer_key read back; registration txs from `npm run tee-register`): marlow `4oddAeH3...`, odile `HUvdxWpm...`,
  sully `Gmmos5qX...`, ines `9ck8CKMe...`, deacon `2MQ6sanf...`.

### Enclave jobs (request_execution txs, attestation URL = `https://testnet-api.outlayer.ai/attestations/by-tx/<tx>`)

| act | buyer | decision | job | tx | ms |
|---|---|---|---|---|---|
| pact | marlow | sign | 44205 | 5pFZ9Tc5Bw2HjUBjvuCyuGn51waWv9RRvWUvHEco32FE | 17007 |
| pact | odile | sign | 44208 | BGPi4TAdkxfizwcXPHq9zTu8zsmqEcCaqrA1bHJa9yS6 | 26107 |
| pact | sully | sign | 44211 | 8svJj1a9B1kAtfAD1nM4v91HHGpf3vcBSRrkCd2EggeR | 49013 |
| pact | ines | sign | 44212 | GTSG9gqhYZpfEGaTrvw6EDugVQbD2ZFaucuHWYsjeY7X | 50159 |
| pact | deacon | sign | 44213 | DgGym273RfArTSHPrBBB6vL915y8GXzsPsr2cQMVQcCX | 53127 |
| confession | marlow | stay_quiet | 44221 | J1M92ghDczkiQQDoVzcdAj7finBmiSSvbkqRpAur4hFd | 15186 |
| confession | odile | stay_quiet | 44222 | HoK4kaCNZaoqTe7XDMPSgiwHwtKgAmWxNqhNdus7C7uy | 18225 |
| confession | sully | **confess** | 44223 | 514VNjUNAzLKSvkZ6K3JNm3Nv68zFegouuqPAgLqgj82 | 20027 |
| confession | deacon | stay_quiet | 44225 | AsZdsAkJSjX8uqHQhpPxfXcMGm7H8dyAjZGU9gZj8aX9 | 26901 |
| confession | ines | stay_quiet | 44224 | CkJkVruNKHobgXshidJyuaN4oG9923zwtpBNzAQc3yLb | 27846 |

Wall clock of the whole pact round: about 53 s (limited by the slowest job). Deliberation round: about 27 s.

## Verification

`outlayer-verify tx <hash> --network testnet` (built from github.com/out-layer/outlayer-verify):

* confession job `514VNjUN...`: Authenticity, Identity, Binding, Input, Output all PASS, **PROVEN** (`evidence/verify-tee-confession-514VNjUN.txt`).
* pact job `5pFZ9Tc5...`: Authenticity, Binding, Input, Output PASS; Identity UNPROVEN twice because the public RPC rate-limited
  the on-chain approved-measurement read. Not a failure of the quote, but not proven either (`evidence/verify-tee-pact-marlow-5pFZ9Tc5.txt`).
  The other eight jobs were not run through the verifier.

## Latency and failures

Per job (this season, 10 jobs): min 15.2 s, **p50 26.5 s, max 53.1 s**, 0 failed attempts, 0 retries.
Earlier runs on the same day were much worse and are the reason the numbers should not be quoted as typical:

| Run | Observation |
|---|---|
| 08:55Z season | 5 jobs sent one by one: 3.7 to 19 s just to get each tx included; results 114 to 128 s; then a retry round; the first begin took over 6 min |
| 09:00Z season | pact jobs 32 to 54 s, but deliberation jobs 29 to 71 s, 130 to 150 s after the offer: both `confess` txs failed `E_NO_LENIENCY` (the window is 200 blocks, about 150 s) |
| 09:08Z season | OutLayer probes took 60 to 125 s each and several came back `Execution promise failed` (platform side); testnet executors were restarting (uptime 10 to 50 s) |
| probes 09:50Z to 10:01Z | 12 of 20 probe jobs failed or timed out before 5 passes completed; 2 passes per buyer finished at 65 to 80 s |

So reliability is dominated by the OutLayer testnet worker pool, not by our code: expect job latency anywhere from 15 s to
over 2 minutes. The deliberation round has to fit in the 200-block window, so a slow pool means `E_NO_LENIENCY` and a
holdout (the server reports the confession attempts honestly). Mitigations in place: jobs are sent without waiting for
inclusion (`wait_until NONE`), all five in parallel, polled every 4 s, 100 s timeout then one retry per job
(`attempts` in the case file), RPC failover with provider cooldown.

## Bugs found and fixed on the way

1. The guest's HTTP client (`wasi-http-client` 0.2.1) wrote a request body in one call: any body over 4096 bytes trapped
   ("Buffer too large for blocking-write-and-flush") or hung. Real prompts are about 5 KB, so every real job failed while the
   short spike jobs passed. Vendored copy (`outlayer/vendor/wasi-http-client`) starts the request, then streams the body in
   4096-byte chunks. The guest's own stdout is also written in chunks.
2. Qwen sometimes replies without JSON ("model reply has no JSON object"): the guest now asks again up to three times.
3. `rpc.testnet.near.org` and drpc rate-limit or lack `send_tx`; the Worker's RPC client skips such providers.
4. Contract identity: each rebuild is a new sha256 and so a new TEE key; the keys were re-registered after each of three freezes.

## Current deployment (outlayer/deployed.json)

| buyer | wasm sha256 | TEE public key (base64, registered on the contract) |
|---|---|---|
| marlow | 247786f1ee5c49efc81fcd5... (full in deployed.json) | kUXT9zMtTy/ZxTjtehf62ruJ7x0GSoJcO879Ymu6N1o= |
| odile | be7272e16403c254fb660212... | nJ6dDqIEgNp3bhjFW0PF68m94v6FhZMx5xzSHbeVnDk= |
| sully | 47f8e85e820ebd0609f4012d... | Lq5Mv1u4Xf+SKqw+dGwnFPPQ+s8/GKDr7y0ib6UWk74= |
| ines | cf43ed9965bced454714c890... | yQJL+tLgsPmtTf4/pAccI6KhuXDGtLc6rt++YUIUwaQ= |
| deacon | 9393fa8b4e3cb2d55d196740... | TQ9P2jxJ0rSflUcmRBw92eYojzXO8rbZMz3yxPjeuwA= |

The sealed `NEARAI_API_KEY` row exists for each hash (`--access whitelist:lowball-house-ck.testnet`). Do not rebuild or edit
`outlayer/` sources without re-running upload, secrets, `npm run tee-probe` and `npm run tee-register`.

## Switching modes

Superseded by the per-season mode below (`TEE_MODE`). `cd server && npm run tee-register -- --server-keys` still works as a
manual reset of the registered keys to the server-held pact keys.

## Not done / not covered

* No full season through the deployed Worker; this was a local Worker (snapshot of the repo, port 8795).
* Only one confession job and one pact job were run through `outlayer-verify`; the pact job's Identity layer is UNPROVEN
  (RPC limit), not failed.
* The four non-confessing seasons' jobs were fine, but no season has run with a payout_evm address under TEE mode.
* Latency under the integrator's three live seasons is unknown; see the table above for how far it can swing.
* Operator trust caveat from `outlayer-spike.md` still applies (OutLayer's DAO key; the house supplies the prompts).

## Per-season mode: enclave or standard (TEE_MODE, added 11:00Z after the live pool failure)

`TEE_MODE = auto | on | off` in `server/wrangler.toml` (default and committed value `auto`; the old `TEE_BUYERS` 1/0 maps to on/off only
when `TEE_MODE` is unset). Code: `server/src/tee/mode.ts`, `setup.ts` (`beginSeason`), `acts.ts`, `cartel.ts`, `leniency.ts`.

* **Chosen right before create_season**, once per season, and emitted as `mode{mode:'enclave'|'standard', reason}`; the case file
  carries `mode` (and `tee` only for enclave seasons).
* **auto** reads the last 10 recorded OutLayer job attempts (D1 table `tee_jobs`, also created on first use): enclave only if
  >= 80% ok AND one ok within 30 min AND p90 latency of the ok jobs < 75 s. If the newest job is older than 30 min (or there is none)
  there is no data: ONE `probe` job (marlow) with a hard 60 s cap decides, and is recorded like any job. A failed probe makes
  the next sessions see "unhealthy" and go standard without waiting; after 30 min a new probe tries again.
* **Keys follow the mode**, because the contract snapshots each buyer's registered key at create_season: for each buyer
  `get_buyer_key` is compared with the wanted key (enclave key from `outlayer/deployed.json`, or the server pact key from
  `BUYER_KEYS_JSON`), and `register_buyer_key` is sent from the buyer's own account only where they differ, in parallel, with a
  read-back (retried up to 6 s). The whole "choose mode, register keys, create_season" runs under a D1 lock (`global_locks`,
  150 s TTL, released in `finally`; another session waits up to 100 s), so two sessions of different modes cannot interleave
  registrations and snapshots (test: `rrrrrCrrrrrC`). No new accounts.
* **standard** is the old path: the server signs pact and confession with the buyers' pact keys (confession_sig included).
* **Degradation inside enclave mode**: a pact job that fails after its retry means that buyer abstains (the pact forms with >= 2
  signers) and a `line{note:true}` is emitted ("Marlow Teague's enclave never answered; he stays out of the pact."); a failed
  deliberation job means that buyer stays silent ("... stays silent."). Nothing throws; the season is never blocked on one job.
* **Job budget**: both attempts of one job share 90 s (first attempt capped at 55 s, the retry gets the rest, skipped under 12 s),
  and the cap is a hard deadline (a rate-limited RPC poll can no longer hold a job past it). A pact round therefore ends in at
  most about 95 s, which is what the begin request needs to stay inside the proxy's budget.

### Real runs (local Worker snapshot on port 8796, testnet, 10:41Z to 11:06Z)

| Run | Result |
|---|---|
| `TEE_MODE=off` season 36 | `mode standard "Enclave signing is switched off."`; 5 `register_buyer_key` txs (EHsEat4N..., 9ymbp6WG..., AMuJ6W2Y..., DHd5yD5Y..., DMqSjE7e...) re-registered the server keys over the enclave keys; create_season `2vMWLhAVoiyRSr21BHeaaofgN2RMDZ1GhGH6Y1Hwc2ue`; confess marlow `Eonh7fc7N3beHDv86ZpdVFmvcrkBKV7KSNM5dXknCPzH` accepted, season Closed (`evidence/E2E-RUN.standard.md`) |
| `TEE_MODE=auto`, empty D1, season 38 | no data, the probe job's 60 s cap expired -> `mode standard "no enclave jobs recorded yet; probe failed: The enclave job did not finish within 60 s."`; confess ines `4ZX7Qbhxj8sEmwQABNRNcaivzJ2XLMZNtowSnLqATXbX` accepted (`evidence/E2E-RUN.auto-fallback.md`) |
| `TEE_MODE=on`, pool failing | `mode enclave`; all five pact jobs failed after their retry (the job txs were accepted, the results never came: the OutLayer log says "Execution promise failed ... Refunded"); five honest `line` notes, no pact, **the season kept going**: day opened, bids, lots settled (`evidence/session-enclave-all-failed-events.json`) |
| `TEE_MODE=auto`, same D1 afterwards | `mode standard "The enclaves look unhealthy: 0 of the last 10 enclave jobs succeeded."` (no probe, so begin took seconds); season completed, confess sully accepted (`evidence/E2E-RUN.standard-via-auto.md`) |

An enclave season with real signatures could not be re-run in this window: the OutLayer testnet executors were restarting every
10 to 60 s (`/public/workers` uptime 1 to 51 s) and the job txs came back "Execution promise failed". The last enclave season
that did work is the 10:03Z one above (season 32).

Observed while doing this, not fixed here: the public testnet RPCs answer HTTP 429 or "provider error 30" in bursts, which also
starves the `tx` polling for job results; a dedicated RPC (paid fastnear key in `RPC_URLS`) would help the Worker and the enclave
path. One `INVALID_TRANSACTION` on a house tx and one `TX_MISMATCH` on a leniency verification happened during these runs
while other sessions were using the same house key and the same free RPCs; both cleared on retry. The signer now keeps the
rejection cause in its error message. D1 tables (`tee_jobs`, `global_locks`) are created automatically; `migrations/0003_tee.sql`
is optional.
