# Lowball payout desk (U3, NEAR Chain Signatures)

When a buyer confesses and the season has a `payout_evm` address, the slashed NEAR goes to this contract
instead of the player's NEAR account. The desk pays the player in **Sepolia ETH**: it builds the EIP-1559
transfer itself, has the NEAR MPC network sign it from a key nobody holds, and an untrusted relayer
(`server/src/chainsig/`) broadcasts it. The desk can only sign a plain ETH transfer it built from
`pay_evm`; no method takes a caller-supplied digest.

| | |
|---|---|
| Desk account | `desk.lowball-ck.testnet` (created and funded by the integrator) |
| Owner / game | `lowball-house-ck.testnet` / `lowball-ck.testnet` |
| MPC signer | `v1.signer-prod.testnet` (v3.19.0 read from the live contract), domain 0 (secp256k1) |
| Derivation path | `lowball-desk-v1` |
| Chain | Sepolia, chain id 11155111, EIP-1559, plain transfer, gas limit 21000 |
| Rate | 1 NEAR = 0.001 ETH (`wei = yocto / 1e9`; 0.2 NEAR -> 0.0002 ETH), `set_rate` changes it |

## Desk Sepolia address (fund this)

```
0x1CE8073F6eFe75470b199aCf8b54532B4c499024
```

Derived for predecessor `desk.lowball-ck.testnet`, path `lowball-desk-v1`. It is a pure function of the
MPC root key, the predecessor account and the path, so it is valid before the desk is deployed. Two
independent routes agree on it (checked 2026-11-14): the offline derivation below, and the signer's own
`derived_public_key` view. `deploy-desk.sh` re-checks both against what the desk contract stores.

**Funding needed.** 30 payouts at 0.0002 ETH = 0.006 ETH, plus gas (21,000 x about 1.5 gwei, 0.00003 ETH per
transfer, about 0.001 ETH for 30; Sepolia base fee is near zero). The relayer refuses to broadcast unless the
balance covers value + max fee, so the headroom per tx is the max fee (30 gwei default until `--sync`, about
0.0006 ETH).

- Minimum: **0.01 Sepolia ETH**.
- Recommended: **0.03 Sepolia ETH**. A full slashed pot is up to 4 x 0.2 NEAR = 0.8 NEAR = 0.0008 ETH per season,
  so 30 such seasons need 0.025 ETH.

Faucets that need no sign-in exist (for example a proof-of-work faucet); none was used here.

## Live status (testnet, 2026-11-14)

- Deployed at `desk.lowball-ck.testnet` (`deployed.json`; init `owner=lowball-house-ck.testnet game=lowball-ck.testnet
  signer=v1.signer-prod.testnet`). `get_derived_address` returns the address above and equals the offline derivation.
- Desk Sepolia address holds about 0.05 ETH (funded by the integrator); nonce and fees synced with `--sync`.
- Real end-to-end run: `pay_evm(9000001, <desk's own address>, 0.01 NEAR)` called from `lowball-ck.testnet`
  (the game account, so the caller check passed) -> MPC signed in about 8 blocks, record `Signed`, `verified: true`
  (on-chain `ecrecover` matched the derived address) -> `desk-payout.ts 9000001` broadcast it ->
  Sepolia tx `0x92fbe20ea23866a2bec120eb8864da5205918b690f594f71c662c4c9c999610c`, block 12131378, status success
  (checked on two providers). It was a 0.00001 ETH self-transfer, nonce 0. Season id 9000001 is a test record; real
  seasons are never that high.
- Recorded real MPC response (and its recovery to the derived key) are in `server/test/fixtures/chainsig-payout.json`.

## Interface

| method | who | notes |
|---|---|---|
| `new(owner, game, signer)` | init | defaults: nonce 0, max fee 30 gwei, tip 2 gwei, rate 1/1e9 |
| `pay_evm(season_id, to, amount_yocto)` | `game` only, **payable** | attached deposit must equal `amount_yocto`; needs >= 90 TGas prepaid (use 100+). Returns the `Pending` record |
| `prepare(next_nonce, max_fee_per_gas, max_priority_fee_per_gas)` | owner | the relayer's `--sync` calls it with the address's pending Sepolia nonce and suggested fees |
| `set_rate(rate_num, rate_den)` | owner | |
| `refresh_derived_address()` | owner | asks the signer's `derived_public_key` view and stores the EIP-55 address |
| `retry_payout(season_id)` | owner | re-requests a `Failed` payout (same recipient and amount) |
| `get_payout(season_id)` | view | record below |
| `get_derived_address()` | view | `null` until `refresh_derived_address` has run |
| `get_config()` | view | |

Nonce design: the desk keeps `next_nonce` and hands one out per `pay_evm`; a failed signature gives it back if
nothing later was issued. The relayer re-syncs it with `--sync` when idle (no `Pending` payout). Payouts must be
broadcast in nonce order; the relayer does one season at a time.

Record (`get_payout`): `season_id, status (Pending|Signed|Failed), to, amount_yocto, amount_wei, chain_id, nonce,
max_fee_per_gas, max_priority_fee_per_gas, gas_limit, digest, unsigned_tx, big_r, s, recovery_id, verified,
requested_block, signed_block, error`.
`unsigned_tx` is `0x02 || rlp([...])`, `digest` its keccak256 (what the MPC signed), `big_r` the 33-byte compressed
point (r = bytes 1..33), `verified` means `env::ecrecover` on chain matched the desk's own address.

Error codes (panic strings): `E_NOT_GAME E_NOT_OWNER E_DEPOSIT_MISMATCH E_GAS_TOO_LOW E_ALREADY_PAID E_BAD_ADDRESS
E_AMOUNT_ZERO E_OVERFLOW E_BAD_FEES E_BAD_RATE E_NO_PAYOUT E_NOT_FAILED`; stored in a `Failed` record:
`E_SIGN_FAILED` (MPC timeout or error), `E_SIG_FORMAT`, `E_SIG_UNRECOVERABLE`, `E_SIG_MISMATCH` (valid signature by
another key: never accepted). Events: NEP-297 `lowball-desk` `payout_requested | payout_signed | payout_failed`.

### Call from the game contract

```rust
Promise::new(desk).function_call("pay_evm", json!({"season_id": s, "to": payout_evm, "amount_yocto": U128(slashed)}).to_string().into_bytes(),
    NearToken::from_yoctonear(slashed), Gas::from_tgas(100))
```

`pay_evm` returns right away; the MPC signature lands in `on_signed` seconds later (the signer yields, 200 block
timeout). If `pay_evm` panics, the attached NEAR is refunded to the game contract in the callback.

## Off-chain address derivation

```
tweak   = sha3_256("near-mpc-recovery v0.1.0 epsilon derivation:" + predecessor + "," + path)   // 32 bytes, big-endian scalar
derived = root_public_key + tweak * G                                                          // secp256k1
address = keccak256(X || Y)[12..32]                                                            // root from v1.signer-prod.testnet public_key{domain_id:0}
```

Implemented in `server/src/chainsig/derive.ts` (`deriveDeskAddress`); `npx tsx scripts/desk-payout.ts --address`
runs it and cross-checks `derived_public_key`. Sources: near/mpc `kdf.rs` and `crypto_shared/kdf.rs`, docs
https://docs.near.org/chain-abstraction/chain-signatures/implementation.

## MPC signer call (v1.signer-prod.testnet)

`sign({request:{path:"lowball-desk-v1", payload_v2:{Ecdsa:"<64 hex = keccak256(unsigned tx)>"}, domain_id:0}})`,
deposit **1 yoctoNEAR**, at least 15 TGas attached (live `config`: `sign_call_gas_attachment_requirement_tera_gas`
15); the desk attaches 50 TGas and 20 TGas for its callback. Response (source: near/mpc `primitives.rs`):
`{"scheme":"Secp256k1","big_r":{"affine_point":"<33-byte hex>"},"s":{"scalar":"<32-byte hex>"},"recovery_id":0|1}`.

## Layout and tests

```
src/lib.rs      state, methods, callbacks        src/tx.rs   EIP-1559 preimage / signed form
src/payout.rs   record, events, MPC parsing      src/rlp.rs  RLP encoder
src/address.rs  address + EIP-55                 mock-signer/  TEST DOUBLE of the MPC signer (never deployed live)
it/             near-workspaces sandbox tests    build.sh      Rust 1.86 + --cfg near, like contract/build.sh
```

```
cd contracts/payout-desk && cargo +1.86.0 test            # 15 unit tests (oracle: viem 2.21 + @noble; one uses a recorded live MPC response)
BUILD_MOCK=1 ./build.sh && cd it && cargo test            # 3 sandbox tests against the mock signer
cd server && npx vitest run test/chainsig                 # relayer: 23 tests
```

Relayer usage: `cd server && npx tsx scripts/desk-payout.ts <season_id>` (also `--address`, `--sync`, `--show N`).
Deploy: `scripts/deploy-desk.sh` (needs `desk.lowball-ck.testnet` to exist with its key in `~/.near-credentials`).
