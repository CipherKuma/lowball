# Lowball: NEAR autonomy spike

Researched 2026-11-14 (machine zone: IST). Scope: public documentation/source reads only; no accounts, funds, deployments or inference jobs created. **D** = documented/source-confirmed; **U** = unverified live or illustrative integration. All effort estimates are engineering judgment for one experienced developer, not vendor promises. “Yes” below means supported, not successfully exercised in this run. Shell DNS failed; web reader could read docs/GitHub but not live model/testnet API responses. No snippets were compiled or executed.

## 1. OutLayer

**Works on testnet: YES (D); current worker/keystore/signing availability: UNKNOWN (U).** `outlayer.fastnear.com` redirects to `app.outlayer.ai`; `fastnear/near-outlayer` redirects to `out-layer/outlayer`. Current documented endpoints: `outlayer.testnet`, `https://testnet-api.outlayer.ai`; mainnet: `outlayer.near`, `https://api.outlayer.ai`. Prefer these over old FastNEAR API hostnames. A NEAR contract can request WASM execution in Intel TDX and attach a callback to receive the resumed result. [Repository](https://github.com/out-layer/outlayer), [integration](https://app.outlayer.ai/docs/near-integration).

**Setup:** obtain a funded NEAR testnet account and deploy/fund the calling contract; build a WASI Preview 2 binary, publish it at HTTPS with SHA-256, optionally register a project/version, and create encrypted secrets bound to the project or exact WASM hash. No OutLayer payment key or stablecoin is required for direct NEAR compute calls. HTTPS calls instead use an OutLayer payment key and its funded balance; current testnet faucet/sponsorship terms are **U**, not assumed free. NEAR AI requires its own real API account/credits even when NEAR settlement is testnet. [Contract reference](https://github.com/out-layer/outlayer/blob/main/contract/README.md), [payment keys](https://app.outlayer.ai/docs/payment-keys).

**Exact call shape (D; values below illustrative/U):** method `request_execution(source, resource_limits, input_data, secrets_ref, response_format, payer_account_id, params)`. Pass `resource_limits` even when `{}`; omission means compile-only. This is the actual [Rust entrypoint](https://github.com/out-layer/outlayer/blob/main/contract/src/execution.rs), superseding older README examples with `execution_source/request_params`.

```rust
// Inside a payable Lowball method; wasm_url/hash are fixed audited configuration.
let job = near_sdk::serde_json::json!({
  "source": {"WasmUrl": {"url": wasm_url, "hash": wasm_hash,
    "build_target": "wasm32-wasip2"}},
  "resource_limits": {"max_instructions": 1_000_000_000,
    "max_memory_mb": 128, "max_execution_seconds": 30},
  "input_data": near_sdk::serde_json::to_string(&round_input).unwrap(),
  "secrets_ref": {"profile": "buyers", "account_id": "owner.testnet"},
  "response_format": "Json", "payer_account_id": null, "params": null
});
near_sdk::Promise::new("outlayer.testnet".parse().unwrap()).function_call(
  "request_execution".into(), job.to_string().into_bytes(),
  near_sdk::NearToken::from_yoctonear(quoted_cost), near_sdk::Gas::from_tgas(200)
).then(Self::ext(near_sdk::env::current_account_id())
  .with_static_gas(near_sdk::Gas::from_tgas(25)).on_buyer());
// on_buyer must be #[private], parse callback_result, reject null/invalid output,
// and bind its signature to pending round/buyer/pact/claimant before state changes.
```

Alternatively `source={"Project":{"project_id":"owner.testnet/buyer","version_key":"<wasm-sha256>"}}`; `null` selects a mutable active version. Returned value is guest JSON/Text/base64 according to format; a guest failure can return `null` despite a successful NEAR receipt. Do not expect the generic metrics envelope shown in some dashboard prose. [Return semantics](https://github.com/out-layer/outlayer/blob/main/contract/README.md).

**Deposit/cost:** query `estimate_execution_cost` with the identical limits and UTF-8 input length; attach its returned decimal yoctoNEAR. `get_pricing` returns base, per-million-instruction, per-ms and compile rates. Input above 32 KiB also requires refundable storage. Example read-only commands (near-cli-rs syntax):

```sh
near contract call-function as-read-only outlayer.testnet get_pricing json-args '{}' network-config testnet now
near contract call-function as-read-only outlayer.testnet estimate_execution_cost json-args '{"resource_limits":{"max_instructions":1000000000,"max_memory_mb":128,"max_execution_seconds":30},"input_len":512}' network-config testnet now
```

[View source](https://github.com/out-layer/outlayer/blob/main/contract/src/views.rs). Source initialization rates imply **0.0040001 test NEAR** reserved for 1B instructions/30s/small input, before network gas; these are **not live testnet prices**. The numeric instruction rate is `10^14` yocto per million (an adjacent source comment disagrees). Actual use settles/refunds; failures can still charge. No verified testnet-free policy. [Rates/formula](https://github.com/out-layer/outlayer/blob/main/contract/src/lib.rs), [pricing](https://app.outlayer.ai/docs/pricing). For our own unpriced project `attached_usd` is unnecessary; priced third-party projects can also require stablecoin payment.

**HTTPS + secrets:** secrets are client-encrypted on chain, authorized/decrypted by the TEE keystore, and injected as environment variables. CKD protects the derivation root; it is not an HTTP header/API key to NEAR AI. Manually supplied NEAR AI credentials remain known to their creator. `PROTECTED_*` secrets can instead be TEE-generated, including ED25519 seeds. [Secrets and CKD](https://app.outlayer.ai/docs/secrets).

```rust
// Cargo: wasi-http-client="0.2", serde_json="1"; wasm32-wasip2.
let token = std::env::var("NEARAI_API_KEY")?;
let payload = serde_json::json!({"model":"z-ai/glm-5.3-flash",
  "messages":[{"role":"user","content":prompt}],"max_tokens":256});
let answer = wasi_http_client::Client::new()
  .post("https://cloud-api.near.ai/v1/chat/completions")
  .header("Authorization", format!("Bearer {token}"))
  .header("Content-Type", "application/json")
  .body(payload.to_string().as_bytes()).send()?;
// Handle HTTP status/body per the client API; never return credentials in stdout.
```

This adapts the actual [AI example implementation](https://github.com/out-layer/ai-example/blob/main/src/main.rs); its dependency is `wasi-http-client`, despite older prose saying reqwest. This snippet uses HTTPS, **not model E2EE or response verification**. Fixed endpoint/model/system prompt are essential: accepting an arbitrary endpoint lets an input steal the secret. Declare network access in the embedded `outlayer.manifest`; see [manifest policy](https://github.com/out-layer/outlayer/blob/main/wasi-examples/CONNECTOR_MANIFEST.md). Ordinary-project network declarations and connector fail-closed enforcement differ; audit the selected worker rather than assuming an allowlist is enforced.

**Persistent signing identity: YES by documented CKD-backed host interface; deployment support U.** WASI P2 only. Embed e.g. `{"signing_keys":[{"path":"pact","type":"ed25519","bind":"wasm","caller":"predecessor"}]}` in `outlayer.manifest`. [Signing rules](https://app.outlayer.ai/docs/signing-keys).

```wit
// outlayer:signing-keys/api@0.1.0; import through wit-bindgen.
public-key: func(path: string, vault: option<string>) -> result<list<u8>, string>;
sign: func(path: string, vault: option<string>, message: list<u8>) -> result<list<u8>, string>;
```

[Authoritative WIT](https://github.com/out-layer/outlayer/blob/main/worker/wit/deps/signing-keys.wit). Raw ed25519 signs raw bytes, not NEP-413/prehashed bytes implicitly; match Lowball's existing pact encoding. Host returns 32-byte public key/64-byte signature, never private key to the guest. No public-only/offline derivation API was verified: perform an attested bootstrap `public-key` job and register its key **before** bonds/pacts. Same hash/path/caller/master yields stable identity across jobs. `project` binding survives upgrades, allowing future project code to sign with that identity; `wasm` binding works only on direct URL jobs and changes identity with the binary. `predecessor` binds to the calling Lowball contract rather than whichever user triggers it. At most three keys per manifest: five buyers need multiple binaries/projects/callers, not five declared paths in one job.

**Proof and limits:** bootstrap evidence is at `/attestations/by-tx/{tx_hash}` on the API host; HTTPS uses `/attestations/by-call/{call_id}`. Independently verify Intel chain, approved measurements and task hash (including WASM/input/output/caller); a returned key alone proves nothing. [Verifier](https://github.com/out-layer/outlayer-verify), [verification workflow](https://app.outlayer.ai/docs/trust-verification). `outlayer-verify tx <hash> --network testnet` is the documented CLI pattern, **not run here**.

**Critical trust risk:** OutLayer's own [custody caveats](https://github.com/out-layer/outlayer/blob/main/docs/NON_CUSTODIAL.md#governance-at-this-stage) say its DAO has a full-access key able to request the shared master **outside an enclave**, a single owner approves builds, and contracts upgrade without a vote/delay. Thus “no operator can ever derive buyer keys” is **not established**, even with hash-bound jobs. Current testnet access keys, deployed code hashes and CKD root-acquisition transactions were not inspected. TDX execution evidence remains useful; unconditional trustlessness does not follow.

**VRF (D):** SDK `outlayer="0.2"`: `let r = outlayer::vrf::random("round-42")?;` and `outlayer::vrf::public_key()?`. It returns `output_hex`, `signature_hex`, `alpha`; `alpha=vrf:{request_id}:{sender_id}:{seed}`, output is SHA256(ed25519 signature). Pin the keystore public key and verify signature/alpha plus output hash; constrain round association to stop rerolling. Max ten calls/job; seeds cannot contain `:`. Public key: `GET https://testnet-api.outlayer.ai/vrf/pubkey`. This is the platform's named VRF construction, not a verified RFC-9381 ECVRF implementation. [VRF API](https://app.outlayer.ai/docs/vrf).

**Latency:** docs advertise execution from <1s to minutes, not a measured p50/p95 or SLA; queue, downloads, inference, attestation and NEAR receipts add time. Default execution limit 60s, cap 180s, but protocol yield expires after 200 blocks, so a permitted 180s job can still miss its callback. Start with 30s and short outputs. [Flow](https://app.outlayer.ai/docs/getting-started).

**Minimal repos/setup:** [out-layer/ai-example](https://github.com/out-layer/ai-example) for HTTP+secret; [vrf-example/vrf-contract](https://github.com/out-layer/vrf-example/tree/main/vrf-contract) for contract callback; [signing-key-probe](https://github.com/out-layer/outlayer/tree/main/wasi-examples/signing-key-probe) for host bindings and build script. Build AI with `rustup target add wasm32-wasip2` then `cargo build --target wasm32-wasip2 --release`; use the probe's `build.sh` to retain/check manifest imports. Probe deliberately signs arbitrary inputs: never use it unchanged for buyers. These are source-inspected examples, **not a working Lowball integration verified here**. GitHub compilation is disabled by default: publish a prebuilt WASM.

**Effort/risk:** 2h go/no-go on one funded testnet HTTP+sign job; 10–16h total for five buyers, contract callbacks and proof registration, plus 2–4h failure/race testing. WASI packaging, live signing-key support, CKD governance and relay fairness are the main risks. No buyer autonomy if the Worker can supply arbitrary state/prompts or request arbitrary pact signatures.

## 2. NEAR AI Cloud

**Works with testnet: YES (chain-independent paid HTTPS service); no separate free NEAR-testnet inference tier verified.** Setup: account/workspace/API key and inference credits at [Cloud console](https://cloud.near.ai); attestation for public models needs no API key. [Tier definitions](https://docs.near.ai/cloud/models): Confidential TEE = NEAR-operated GPUs; Incognito = TEE gateway then ordinary upstream provider; 3P Confidential TEE is a separate category. Gateway attestation alone does not prove model inference is in a TEE.

**Catalog snapshot (display names, not guaranteed API IDs):** [live catalog](https://near.ai/models).
- **Own fleet / NEAR AI provider (12):** DeepSeek V4.1 Flash 1017; its Abliterated variant; FLUX.2-klein-4B; GLM 5.3 Flash; Privacy Filter; Qwen 3.6 35B A3B FP8; Qwen 3.8 27B; its Abliterated variant; Qwen3-Embedding-0.6B; Qwen3-Reranker-0.6B; Qwen3-VL-30B-A3B-Instruct; Whisper Large v3.
- **Also labeled Private TEE:** Levanto Sage 2 (provider Levanto); do not silently count it among the twelve NEAR AI-provider models.
- **3P TEE (4):** deepseek-v3.2, GLM 5.3, Kimi K2.6, Kimi K3.
- **Incognito:** Claude Fable 5/5.1/5.2; Haiku 4.5/5.5; Opus 4.6/4.7/4.8/5/5.5; Sonnet 4.5/4.6/5/5.5; DeepSeek V4.1 Flash and Flash 1017; Gemini 2.5 Flash/Flash Lite/Pro, 3.1 Flash Lite, 3.5 Flash, 3.8 Flash; Kimi K3.1 Pro; GPT-4.1/4.1 Mini, GPT-5/Mini/Nano/5.1/5.2/5.4/5.4 Mini/5.4 Nano/5.5/5.6 Luna/5.6 Sol/6 Astra/6 Luna/6 Sol/6.1 Sol, o3/o3 Mini/o4 Mini; Qwen3.7 Max; Jev 1.13; Grok 4.6/4.7.

Refresh canonical IDs/availability using `GET https://cloud-api.near.ai/v1/models`; raw live response was inaccessible here. Similar DeepSeek names occur in multiple tiers: never select by marketing name alone. GLM canonical ID `z-ai/glm-5.3-flash` is explicitly used by current SDK docs.

**Exact report request + basic TypeScript GPU verdict (D API, U execution):** [model reports](https://docs.near.ai/cloud/verification/cloud-api/model-attestations).

```ts
import { randomBytes } from 'node:crypto';
import { getCollateralAndVerify } from '@phala/dcap-qvl';
const nonce = randomBytes(32).toString('hex');
const query = new URLSearchParams({model:'z-ai/glm-5.3-flash', provider:'near',
  signing_algo:'ed25519', include_tls_fingerprint:'false', nonce});
const res = await fetch(`https://cloud-api.near.ai/v1/attestation/report?${query}`,
  {headers:{'x-no-aliasing':'true'}});
if (!res.ok) throw new Error(`attestation HTTP ${res.status}`);
const evidence = await res.json();
if (!evidence.model_attestations?.length) throw new Error('No model evidence');
for (const report of evidence.model_attestations) {
  const quote = await getCollateralAndVerify(
    Buffer.from(report.intel_quote.replace(/^0x/, ''), 'hex'));
  if (quote.status !== 'UpToDate') throw new Error('Unaccepted Intel TCB');
  // ALSO apply nonce/signer, debug, RTMR3, configuration and allowlist checks below.
  if (!report.nvidia_payload) throw new Error('GPU evidence required by our policy');
  const gpu = JSON.parse(report.nvidia_payload);
  if (gpu.nonce?.toLowerCase() !== nonce) throw new Error('GPU nonce mismatch');
  const verdict = await fetch('https://nras.attestation.nvidia.com/v3/attest/gpu', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(gpu)});
  if (!verdict.ok) throw new Error('NRAS rejected evidence');
  const tokens = await verdict.json();
  if (tokens[0]?.[0] !== 'JWT') throw new Error('Malformed NRAS response');
  const claims = JSON.parse(Buffer.from(tokens[0][1].split('.')[1], 'base64url').toString());
  if (claims['x-nvidia-overall-att-result'] !== true) throw new Error('GPU attestation failed');
}
```

Library: [`@phala/dcap-qvl`](https://github.com/Phala-Network/dcap-qvl) fetches Intel collateral and validates the quote chain/TCB. This fragment **is not a complete attestation verifier**. Apply the official [Node verification helper](https://docs.near.ai/cloud/verification/reference/quote-nonce-signer): require TDX/debug off; bind fresh nonce and signer from verified reportData; replay RTMR3; hash raw `app_compose` against MRCONFIGID; check approved measurements/provenance. Verify gateway evidence too. GPU snippet trusts HTTPS-authenticated NRAS; it decodes rather than independently authenticates JWTs. Local JWT/EAT verification needs a separately configured NVIDIA trust/JWKS policy (e.g. `jose`); exact NVIDIA issuer/key-discovery integration **U**, not fabricated here. GPU checks run on every candidate, not just the first.

Keep verified reports **before** inference. Afterwards accept a `provider_tee` response only when its signer/algorithm uniquely matches retained model evidence; a `gateway` signature authenticates the router only. Reports for instances can share signing keys, so signature matching does not establish one exact serving instance. [Response signatures](https://docs.near.ai/cloud/verification/cloud-api/response-signatures).

For a supported TypeScript verification API rather than implementing those bindings yourself, the [SDK's standalone example](https://github.com/nearai/inference-sdk/blob/main/examples/example-js/gateway/chat-completions-bare.ts) uses the following composition (D source, U execution). Its model verifier checks GPU evidence when present; separately require its presence for Lowball. Apply strict status/measurement policy rather than relying on library defaults:

```ts
import { AttestationClient, verifyGatewayAttestation, createPinnedTlsFetch,
  verifyModelAttestation } from '@nearai/inference-sdk/node';
const bootstrap = new AttestationClient({baseUrl:'https://cloud-api.near.ai/v1/',
  apiKey:process.env.NEARAI_API_KEY!});
const g = await bootstrap.fetchGatewayAttestation({signingAlgo:'ed25519'});
const checkedGateway = await verifyGatewayAttestation({
  attestation:g.attestation, clientBinding:g.clientBinding});
if (checkedGateway.tlsBinding.kind !== 'attested') throw new Error('No TLS binding');
const api = new AttestationClient({baseUrl:'https://cloud-api.near.ai/v1/',
  apiKey:process.env.NEARAI_API_KEY!,
  fetch:createPinnedTlsFetch(checkedGateway.tlsBinding.spkiFingerprint)});
const m = await api.fetchModelAttestations({model:'z-ai/glm-5.3-flash',signingAlgo:'ed25519'});
if (!m.attestations.length) throw new Error('No model evidence');
const checkedModels = await Promise.all(m.attestations.map(attestation =>
  verifyModelAttestation({attestation,clientBinding:m.clientBinding})));
// Retain checkedModels for verifyModelResponse / findModelAttestationsForSignature.
```

**E2EE shortest route:** install `@nearai/inference-sdk`, use Node >=24.22.1 per current [JS SDK docs](https://docs.near.ai/cloud/inference-sdk/javascript). Strict TCB policy shown; default also accepts OutOfDate. API below is documented, not run:

```ts
import { InferenceClient } from '@nearai/inference-sdk/node';
const policy = {policy:{acceptedTcbStatuses:['UpToDate']}};
const client = new InferenceClient({apiKey:process.env.NEARAI_API_KEY!,
  baseUrl:'https://cloud-api.near.ai/v1', e2ee:true,
  gatewayVerification:policy, modelVerification:policy});
const result = await client.chat.completions.create({model:'z-ai/glm-5.3-flash',
  messages:[{role:'user',content:'Choose a bid from 1 through 100.'}]});
const receipt = await client.verifyResponse(result.id);
if (receipt.signatureKind !== 'provider_tee') throw new Error('Model proof required');
// Separately require GPU evidence/NRAS policy; do not infer it from this receipt.
```

SDK preflights gateway/model reports and encrypts supported chat fields, then verifies exact response bytes explicitly. Rust WASI compatibility of the SDK/verifier is **U**; this Node snippet cannot simply run inside OutLayer WASM.
Manual [E2EE v2](https://docs.near.ai/cloud/guides/e2ee-chat-completions): attest/select ed25519 model key; convert to X25519; ephemeral ECDH + HKDF-SHA256 (`ed25519_encryption`) + XChaCha20-Poly1305; hex wire `[ephemeral_pub(32)|nonce(24)|ciphertext+tag]`. POST `/v1/chat/completions` with `X-Signing-Algo: ed25519`, `X-Client-Pub-Key`, `X-Model-Pub-Key`, `X-Encryption-Version: 2`, `x-no-aliasing: true`, Bearer key. Encrypt contents, decrypt returned content/reasoning; `X-Encrypt-All-Fields: true` extends to tools. Use `libsodium-wrappers`/noble primitives only following full test vectors; Node SDK is lower risk.

**Cost/effort/risk:** catalog GLM Flash rates: $0.08/M input, $0.50/M output; 5 calls × (2k input + 256 output) ≈ **$0.00144**, excluding retries/history/OutLayer. Attestation advertised free. Estimate 2–4h Node E2EE/signature integration, 4–8h strict evidence/GPU policy; WASI port adds 6–12h uncertainty. Inference proof alone leaves buyer signing keys under Worker control; independent autonomy still absent.

## 3. Chain Signatures

**Works on testnet: YES (D), live signing U.** Signer is **`v1.signer-prod.testnet`**; mainnet `v1.signer`. Setup: funded calling contract, choose stable per-chain path, derive public key/address, fund that address with Sepolia ETH, and run an untrusted relayer with Sepolia RPC. [Implementation guide](https://docs.near.org/chain-abstraction/chain-signatures/implementation).

**Exact sign API:** `sign({request:{path, payload_v2:{Ecdsa:"<64 hex chars>"},domain_id:0}})`; domain 0 secp256k1, 1 ed25519. Legacy `{request:{payload:[32 bytes],path,key_version:0}}` remains accepted in inspected source. Do not send both aliases. [Wire args](https://github.com/near/mpc/blob/d0fc87b19e2643299e7becdd7d9611afcd5d5a78/crates/near-mpc-crypto-types/src/sign.rs), [hex payload enum](https://github.com/near/mpc/blob/d0fc87b19e2643299e7becdd7d9611afcd5d5a78/crates/near-mpc-crypto-types/src/primitives.rs).
Deposit **1 yoctoNEAR** in current [constant](https://github.com/near/mpc/blob/d0fc87b19e2643299e7becdd7d9611afcd5d5a78/crates/near-mpc-contract-interface/src/deposits.rs); gas requirement is contract configuration, so verify deployed config before assuming an old 50 TGas example works. Allow 250 TGas for signer plus caller/callback within NEAR's transaction budget. Deployed binary/API/config parity with inspected commit is **U**. ECDSA digest must also satisfy source scalar validation; handle rare rejection rather than changing the transaction hash arbitrarily. [Entry point](https://github.com/near/mpc/blob/d0fc87b19e2643299e7becdd7d9611afcd5d5a78/crates/contract/src/api/sign.rs).

**Address derivation:** view `derived_public_key({path:"lowball-sepolia-v1",predecessor:"lowball.testnet",domain_id:0})`; base58-decode returned `secp256k1:` key to 64-byte X||Y; Ethereum address = last 20 bytes of Keccak256(X||Y). The predecessor is the **calling contract**, not the human transaction signer. On-contract use a cross-contract view/callback and `env::keccak256`; off-chain `bs58` + `viem.keccak256` or `chainsig.js` adapter `deriveAddressAndPublicKey` does the same. [Public-key API](https://github.com/near/mpc/blob/d0fc87b19e2643299e7becdd7d9611afcd5d5a78/crates/contract/src/api/keys.rs).

**Minimal payout integration sketch (U, not a complete deployed example):** construct the transaction from finalized winner state, never expose unrestricted digest signing. Use [`omni-transaction`](https://github.com/near/omni-transaction-rs) with `evm` feature:

```rust
// Inside an authorized, single-payout method; persist tx + nonce pending first.
let tx = TransactionBuilder::new::<EVM>().chain_id(11155111).nonce(nonce)
  .to(winner_address).value(1_000_000_000_000u128).input(vec![])
  .gas_limit(21_000).max_fee_per_gas(max_fee).max_priority_fee_per_gas(tip).build();
let digest = near_sdk::env::keccak256(&tx.build_for_signing());
let args = near_sdk::serde_json::json!({"request":{
  "path":"lowball-sepolia-v1", "domain_id":0,
  "payload_v2":{"Ecdsa":hex::encode(digest)}}});
near_sdk::Promise::new("v1.signer-prod.testnet".parse().unwrap()).function_call(
  "sign".into(), args.to_string().into_bytes(),
  near_sdk::NearToken::from_yoctonear(1), near_sdk::Gas::from_tgas(250)
).then(Self::ext(near_sdk::env::current_account_id())
  .with_static_gas(near_sdk::Gas::from_tgas(15)).on_payout_signature());
// Callback validates signature, stores/emits signed raw transaction. On failure
// clean pending state; never assert Ethereum payment occurred merely from signing.
```

`build_for_signing` is an RLP preimage, not a hash. Callback extracts `r` from big-R's X coordinate, `s`, recovery id from MPC response, assembles `build_with_signature` with the library's expected signature type (or viem `serializeTransaction(tx,{r,s,yParity})`), then relayer submits `eth_sendRawTransaction`; use `eth_getTransactionReceipt` for readback. Exact adapter glue **U**. `21_000` gas only covers an ordinary ETH recipient; estimate contract-recipient gas. A NEAR contract cannot HTTP-broadcast itself. No bridge magically turns held NEAR bonds into Sepolia ETH.

Current [near-multichain](https://github.com/near-examples/near-multichain) demonstrates derive/build/sign/relay; Rust builder above covers contract-side construction. Old [chainsig-script](https://github.com/deprecated-near/chainsig-script) has a proxy-contract/Sepolia pattern but redirects to **deprecated-near**, so treat it as migration reference, not a current drop-in. No maintained complete contract-to-Sepolia payout repo was validated in this run.
**Cost/effort/risk:** 1 yocto + NEAR gas per signature; Sepolia ETH funds value and EVM gas (test assets, faucet availability U). Estimate 4–8h happy-path transfer, 8–14h payout authorization/nonce/retry/readback. MPC removes individual private-key custody, but signs what the NEAR contract authorizes; it does not prove an AI chose anything. Separate payout from bond settlement and handle delayed MPC/relayer, duplicate payout, fee replacement, and lack of cross-chain finality proof.

## 4. NEP-519 yield/resume in near-sdk 5.x

**Works on testnet: YES (D); no live exercise here.** Protocol [NEP-519](https://github.com/near/NEPs/blob/master/neps/nep-0519.md) is final. Native APIs are `env::promise_yield_create`, `env::read_register` (32-byte data ID), `env::promise_return`, `env::promise_yield_resume`. `yield_id` is a value, not a standalone host function. Repository currently pins `~5.27`; low-level API exists in [5.17.2 source](https://github.com/near/near-sdk-rs/blob/near-sdk-v5.17.2/near-sdk/src/environment/env.rs). Newer [5.29.1 tutorial](https://docs.near.org/smart-contracts/anatomy/yield-resume) uses `Promise::new_yield` → `(Promise,YieldId)` and `yield_id.resume(bytes)`; don't silently assume that wrapper exists in 5.27.

```rust
// Near-sdk 5.x fragment; state includes requests: map<u64,CryptoHash>, oracle.
pub fn wait(&mut self, request: u64) {
  assert!(!self.requests.contains_key(&request), "Request already pending");
  let index = near_sdk::env::promise_yield_create("finish",
    &near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"request":request})).unwrap(),
    near_sdk::Gas::from_tgas(10), near_sdk::GasWeight(0), 7);
  let id: near_sdk::CryptoHash = near_sdk::env::read_register(7).unwrap().try_into().unwrap();
  self.requests.insert(request, id);
  near_sdk::env::promise_return(index);
}
pub fn respond(&mut self, request: u64, answer: String) -> bool {
  assert_eq!(near_sdk::env::predecessor_account_id(), self.oracle);
  let id = self.requests.get(&request).expect("Unknown request");
  near_sdk::env::promise_yield_resume(id, &near_sdk::serde_json::to_vec(&answer).unwrap())
}
#[private]
pub fn finish(&mut self, request: u64,
  #[callback_result] result: Result<String, near_sdk::PromiseError>) -> Option<String> {
  self.requests.remove(&request); // also on timeout; don't panic and undo cleanup
  result.ok()
}
```

Fragment assumes map APIs matching the chosen collection; not compiled. [Create API](https://docs.rs/near-sdk/latest/near_sdk/env/fn.promise_yield_create.html), [resume semantics](https://docs.rs/near-sdk/latest/near_sdk/env/fn.promise_yield_resume.html): timeout is **200 blocks**, not a guaranteed wall-clock duration. Resume must execute in the same account that yielded; an external service calls its authenticated `respond` entrypoint. First successful resume supplies the payload; repeated calls can return true before processing, so bool alone is not replay protection. Keep per-request state. Payload limit is 1024 bytes; use hashes/references or staged output for larger values. Setup: existing contract/gas + responder/indexer; cost ordinary NEAR gas/storage, no separate oracle subscription. Effort 1–3h integration + 2h timeout/auth/race tests. Risk: committed pending state, reentrancy/races and timeouts; **yield adds no verification or autonomy**. Minimal repo: [near-examples/yield-resume](https://github.com/near-examples/yield-resume).

## Ranked recommendation for the next 20 hours

1. **OutLayer hash-bound buyer execution + existing NEAR testnet settlement (best autonomy gain; conditional 16–20h).** Spend at most 2h establishing one real signed HTTPS-inference job, stable public key across two executions, and independently checked testnet attestation. Stop this route if unavailable. Use five buyer-specific binaries (fixed buyer ID changes each hash), one `pact` key each, `bind=wasm/caller=predecessor`, contract-triggered jobs and attested bootstrap registration. Remove Worker buyer secrets after migration; Worker can relay but cannot choose/sign. Budget 8h job/callback integration, 4h round/claimant validation and 4h live failure/race checks; 2h contingency. Claim “attested policy execution under OutLayer's current governance,” not operator-proof custody.
2. **NEAR AI own-fleet model + strict E2EE/evidence/signature verification (4–8h; fallback and useful companion).** Publish checks/receipts bound to each round. This proves inference provenance, not independent buyer key custody. WASI verification portability is a separate risk: don't insert Node-only SDK code into WASM. If full model verification cannot fit, explicitly report HTTPS-to-TEE-service as the remaining trust assumption.
3. **Native yield/resume only where needed (2–5h).** OutLayer already owns its yield internally; Lowball needs a normal callback. Use native yield only for an additional external wait with bounded timeout. Never hold an entire multi-turn game inside one 200-block yield.
4. **Defer Chain Signatures/Sepolia (8–14h robust path).** Adds cross-chain spectacle and custody primitives, but little evidence that buyers make decisions autonomously; it competes with the core signing/provenance work.

**Acceptance gates for the recommended route (not run; all presently UNENFORCED):** registered public keys match verified bootstrap outputs; exact audited WASM/prompt/model/state source; guest checks finalized on-chain round/pact rather than Worker-authored history; one durable decision per buyer/round (no model reroll oracle); domain-separated signed round/game/network/buyer/pact/decision/claimant; contract rejects changed claimant, cross-round replay and duplicates; invalid output/late jobs cannot slash; all five keys absent from Worker; independent execution and model-proof checks with backend readback. Public pact signatures otherwise let a relayer race the buyer for immunity: bind beneficiary in the signed decision and pay that buyer regardless of submitter, or retain authenticated buyer submission. Scheduling/censorship and first-inclusion ordering remain controlled by relayers/chain, so attested decisions do not establish fair simultaneous timing. No autonomy claim beyond gates actually exercised.
