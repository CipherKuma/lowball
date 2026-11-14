# Pact signature encoding (Lowball contract)

The server signs, the contract verifies. Both must agree byte for byte.

## Signed message

```
message = b"LOWBALL-PACT-v1:"  ++  borsh(Pact)
signature = ed25519_sign(secret_key, message)            // 64 bytes, standard RFC 8032, pure ed25519
```

The contract calls `env::ed25519_verify(sig, message, registered_pk)` where `registered_pk` is the 32-byte key
the buyer registered with `register_buyer_key` (snapshotted into the season at `create_season`).

## borsh(Pact) byte layout

Pact = `{ season_id: u64, cap: u32, members: Vec<AccountId>, nonce: u64 }`. All integers little endian.

| bytes | field |
|---|---|
| 8 | `season_id` u64 LE |
| 4 | `cap` u32 LE |
| 4 | `members.len()` u32 LE |
| per member: 4 + n | u32 LE byte length n, then the UTF-8 account id (no terminator) |
| 8 | `nonce` u64 LE |

Order of `members` is significant (it is signed as given). No padding, no trailing bytes.

## JSON on the wire (`confess` arguments)

```json
{
  "season_id": 7,
  "pact": {"season_id": 7, "cap": 40, "members": ["marlow.x.testnet", "odile.x.testnet"], "nonce": "1234567890123456789"},
  "signatures": [{"signer": "marlow.x.testnet", "signature": "<base64 of the 64 raw signature bytes>"}],
  "confession_sig": "<base64 of 64 raw bytes: the CALLER's own pact-key signature, see below>"
}
```

- `pact.season_id` and `pact.nonce` accept a JSON number OR a decimal string. Send `nonce` as a string: a 64-bit value does
  not survive a JavaScript number above 2^53. `get_season` returns `pact_nonce` as a string.
- `signature` and `register_buyer_key.public_key` are standard base64 (with padding) of raw bytes.
- `signer` must be a member of `pact.members` and a buyer of the season; each signer at most once.
- Commit hash for bids: `sha256(amount_u32_le ++ salt32)`, base64 of the 32 digest bytes; `salt` is exactly 32 bytes.

## Confession signature (`confession_sig`)

The house server holds the buyers' NEAR keys, so a NEAR-signed `confess` alone does not show the buyer chose to confess.
`confess` therefore also needs the CALLER's own pact-key signature (the key snapshotted at `create_season`, the same key
that signs the pact) over a separate, domain-separated message:

```
confession_message = b"LOWBALL-CONFESS-v1:"  ++  borsh(ConfessionMsg)
ConfessionMsg      = { season_id: u64, confessor: AccountId, pact_nonce: u64 }
confession_sig     = ed25519_sign(caller_pact_secret_key, confession_message)     // 64 bytes, base64 on the wire
```

| bytes | field |
|---|---|
| 19 | ASCII prefix `LOWBALL-CONFESS-v1:` |
| 8 | `season_id` u64 LE (the `season_id` argument of `confess`) |
| 4 + n | `confessor`: u32 LE byte length n, then the UTF-8 account id of the `confess` caller (transaction signer) |
| 8 | `pact_nonce` u64 LE (= `pact.nonce` of the submitted pact) |

No padding, no trailing bytes. Check order in the contract: after every `E_NOT_MEMBER` / `E_DUP_SIGNER` / `E_BAD_SIG`
check and before `E_TOO_FEW`. A missing, wrong-length or invalid signature is `E_BAD_CONFESSION_SIG`. Binding season,
confessor and nonce means a signature cannot be replayed in another season, by another account, or against another pact.
Tool: `cargo run -q -p pactsign -- confess-sign <secret_key_hex> <season_id> <confessor> <pact_nonce>`.

```confession-vector
secret_key_hex: 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
public_key_b64: A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=
season_id: 7
confessor: marlow.lowball-ck.testnet
pact_nonce: 1234567890123456789
borsh_hex: 0700000000000000190000006d61726c6f772e6c6f7762616c6c2d636b2e746573746e65741581e97df4102211
confession_message_hex: 4c4f5742414c4c2d434f4e464553532d76313a0700000000000000190000006d61726c6f772e6c6f7762616c6c2d636b2e746573746e65741581e97df4102211
confession_sig_b64: zffnG8aMFU6LtJPvslu9/Uq+LuR5VxeAxULok6Yr9cQn04C31LIJBQBPFmGIHLto/joIuMB6OVnPGIH8jousAw==
```

Verified three ways like the pact vector: `contract/pactsign` (Rust), `contract/it/tests/vector.rs`, and an independent
Node `crypto` computation (identical message hex and signature).

TypeScript (uses `enc`, `cat`, `u32`, `u64` from the pact helper above):

```ts
export function confessionMessage(seasonId: number | bigint, confessor: string, pactNonce: string | bigint) {
  const who = enc.encode(confessor);
  return cat(enc.encode("LOWBALL-CONFESS-v1:"), u64(BigInt(seasonId)), u32(who.length), who, u64(BigInt(pactNonce)));
}
```

## Test vector (verified by tests)

Secret key = ed25519 seed `00 01 02 ... 1f` (32 bytes). Verified three ways: `contract/pactsign` (Rust),
`contract/it/tests/vector.rs` (reads this file and recomputes), and an independent Node `crypto` implementation.

```vector
secret_key_hex: 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
public_key_b64: A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=
pact_json: {"season_id":7,"cap":40,"members":["marlow.lowball-ck.testnet","odile.lowball-ck.testnet","sully.lowball-ck.testnet"],"nonce":"1234567890123456789"}
borsh_hex: 07000000000000002800000003000000190000006d61726c6f772e6c6f7762616c6c2d636b2e746573746e6574180000006f64696c652e6c6f7762616c6c2d636b2e746573746e65741800000073756c6c792e6c6f7762616c6c2d636b2e746573746e65741581e97df4102211
message_hex: 4c4f5742414c4c2d504143542d76313a07000000000000002800000003000000190000006d61726c6f772e6c6f7762616c6c2d636b2e746573746e6574180000006f64696c652e6c6f7762616c6c2d636b2e746573746e65741800000073756c6c792e6c6f7762616c6c2d636b2e746573746e65741581e97df4102211
signature_b64: Thhj+uQxEfWM5vARnydDOSAp3pwM2bC77qvIO1waYCFSp3GK9fxJM0uzPyGaAKNt+imkY3CaClBuq/YglsktCg==
```

## Producing a signature

Rust helper (same crate the contract uses for the encoding):

```
cd contract
cargo run -q -p pactsign -- keygen                       # {"secret_key_hex","public_key_b64"}
cargo run -q -p pactsign -- sign <secret_key_hex> '<pact json>'
#   -> {"public_key_b64","borsh_hex","message_hex","signature_b64"}
```

TypeScript (Node / Workers; no borsh library needed):

```ts
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b };
const u64 = (n: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b };
const cat = (...p: Uint8Array[]) => p.reduce((a, x) => { const o = new Uint8Array(a.length + x.length); o.set(a); o.set(x, a.length); return o }, new Uint8Array());
const enc = new TextEncoder();
export function pactMessage(p: { season_id: number | bigint; cap: number; members: string[]; nonce: string | bigint }) {
  return cat(enc.encode("LOWBALL-PACT-v1:"), u64(BigInt(p.season_id)), u32(p.cap), u32(p.members.length),
    ...p.members.map((m) => cat(u32(enc.encode(m).length), enc.encode(m))), u64(BigInt(p.nonce)));
}
// then: signature = await crypto.subtle.sign("Ed25519", privateKey, pactMessage(pact))   // or @noble/ed25519
```

Never sign anything else with a buyer's pact key: the two fixed prefixes (`LOWBALL-PACT-v1:`, `LOWBALL-CONFESS-v1:`) are the only domain separation.
