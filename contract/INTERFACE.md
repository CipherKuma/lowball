# Lowball contract: public interface (after BRIEF-2 U1/U2/U3-game-half)

Network: NEAR testnet. Contract `lowball-ck.testnet` (house `lowball-house-ck.testnet`). Wasm built by
`contract/build.sh`. JSON args/returns. `U128` = decimal string, `U64`-ish fields noted. Every failure is a
panic whose message is exactly an `E_...` code (match on substring of the execution error).

## Breaking changes vs the first version (server/web must adapt)

| Change | Detail |
|---|---|
| `open_lot` gains **required** `weight_kg: u32` | `open_lot(season_id, species, fair_value, weight_kg)`. 0 or missing: `E_BAD_ARGS` / deserialisation error. |
| `create_season` gains optional `payout_evm: String \| null` | Omit for the old behaviour (NEAR to the player). Bad address: `E_BAD_EVM`. |
| `offer_leniency` is no longer idempotent | A second call while the window is open fails `E_LENIENCY_OPEN`. |
| **`offer_leniency` transaction is not "final" until the window resolves** | It leaves a yielded receipt pending (confession, or the 200-block timeout, about 3 to 4 min). A client that waits for `EXECUTED`/`FINAL` will hang (near-workspaces retried and got `E_LENIENCY_OPEN`). Wait for `INCLUDED_FINAL`/`INCLUDED` only, or poll `get_season(...).leniency_open`. The function receipt itself succeeds in the next block or two; read the open block from `get_season`. `confess` is not affected (its tx finishes quickly because it resumes the yield). |
| `confess` window rule | needs a **live** window: yield pending, same day as the window, and `block_height <= leniency_open_block + 200`. After the timeout: `E_NO_LENIENCY`. A new day's `open_lot` also kills the old window (as before). |
| `confess` with `payout_evm` season | needs more gas: attach **at least 250 Tgas** (it forwards up to 200 Tgas to `desk.pay_evm`). Without `payout_evm`, 30 Tgas is plenty (about 5 Tgas used). |
| New fields on views | see `SeasonView` / `LotView` below (additive). |
| New error codes | `E_LENIENCY_OPEN`, `E_BAD_EVM`, `E_NO_TOKEN`, `E_NOT_TOKEN_OWNER`, `E_MT_PARTIAL`, `E_NEED_1_YOCTO`, `E_SELF_TRANSFER`, `E_NOT_CONTRACT`. All older codes keep their meaning and check order. |
| Season close/confess with an unsold open lot | the lot's token returns to the player (`mt_transfer`, memo `returned unsold`). |
| Pact encoding | unchanged (`PACT_ENCODING.md`). |

## Methods

Caller column: H house, P player, B season buyer, A anyone, C the contract account itself.

| Method | Caller | Args | Deposit | Returns | Errors |
|---|---|---|---|---|---|
| `new` | init | `house: AccountId` | 0 | | (init only once) |
| `reset` | C | `house` | 0 | state wipe, used by the deploy script on layout change | `E_NOT_CONTRACT` |
| `set_desk` | H | `desk: AccountId` | 0 | | `E_NOT_HOUSE` |
| `register_buyer_key` | B-to-be | `public_key: base64 (32 bytes)` | 0 | | `E_BAD_KEY` |
| `create_season` | H | `player, buyers[5], days (1..30), bond: U128, payout_evm?: "0x"+40 hex` | 0 | `season_id: u64` | `E_NOT_HOUSE E_BAD_ARGS E_NO_KEY E_BAD_EVM` |
| `post_bond` | B | `season_id` | exactly `bond` | | `E_NO_SEASON E_NOT_BUYER E_BOND_POSTED E_BAD_DEPOSIT E_CLOSED E_SEASON_OVER` |
| `open_lot` | H | `season_id, species (1..64 chars), fair_value: u32 >0, weight_kg: u32 >0` | 0 | | `E_NOT_HOUSE E_BAD_ARGS E_BONDS_MISSING E_LOT_OPEN E_PAST_DAYS E_CLOSED E_SEASON_OVER`. Mints the NEP-245 token into escrow. |
| `commit_bid` | B | `season_id, hash: base64 (32)` = sha256(amount_le_u32 ++ salt32) | 0 | | `E_NO_BOND E_NO_LOT E_ALREADY_COMMITTED E_BAD_ARGS` |
| `reveal_bid` | B | `season_id, amount: u32, salt: base64 (32)` | 0 | | `E_NO_COMMIT E_ALREADY_REVEALED E_BAD_REVEAL` |
| `settle_lot` | A (H with partial reveals) | `season_id` | 0 | | `E_NOT_READY E_NO_LOT`. Transfers the token escrow -> winner (memo `sold at <price> marks`). |
| `offer_leniency` | P | `season_id` | 0 | | `E_NOT_PLAYER E_NO_DAY E_LENIENCY_OPEN E_CLOSED E_SEASON_OVER`. Yields; see breaking changes. |
| `confess` | B | `season_id, pact: Pact, signatures: PactSig[]` | 0 | `U128` slashed total | `E_CLOSED E_ALREADY_CONFESSED E_NOT_BUYER E_NO_LENIENCY E_SEASON_MISMATCH E_NOT_MEMBER E_DUP_SIGNER E_BAD_SIG E_TOO_FEW` |
| `withdraw_bond` | B | `season_id` | 0 | | `E_SEASON_OPEN E_NO_BOND E_SLASHED E_ALREADY_WITHDRAWN` |
| `close_season` | H, or A when last lot settled / 3 days idle | `season_id` | 0 | | `E_CLOSED E_NOT_FINISHED` |
| `mt_transfer` | token owner | `receiver_id, token_id, amount: U128 (= full weight), approval?, memo?` | exactly 1 yocto | | `E_NEED_1_YOCTO E_SELF_TRANSFER E_NO_TOKEN E_NOT_TOKEN_OWNER E_MT_PARTIAL` |
| `mt_batch_transfer` | token owner | `receiver_id, token_ids[], amounts[], approvals?, memo?` | exactly 1 yocto | | as above, `E_BAD_ARGS` |
| `on_leniency_end`, `on_desk_paid` | private callbacks | | | | not callable externally |

`Pact = {season_id: u64|"decimal", cap: u32, members: AccountId[], nonce: u64|"decimal"}`,
`PactSig = {signer: AccountId, signature: base64(64)}`. `confess` check order is part of the contract (see `pact.rs`).

### Leniency clock (U1)

`offer_leniency` creates a NEP-519 yield `on_leniency_end(season_id, window, day)`. Resolved by:
- **confession**: `confess` resumes the yield (payload `{"confessor","season_id"}`); the callback clears the window
  immediately, no holdout is counted;
- **timeout** (protocol constant 200 blocks): callback clears the window, `holdouts += 1` (only if the season is still
  Open), event `holdout`.

A window belongs to one day. Opening the next day's lot supersedes it (confess then fails `E_NO_LENIENCY`); the player may
open a fresh window on the new day while the old yield is still pending. After a timeout the player may open another window
the same day. Closing the season cancels the accounting (late timeouts count nothing).

### Cross-chain payout (U3, game-contract half)

Seasons created with `payout_evm`: `confess` does not transfer NEAR to the player. It calls
`desk.pay_evm({season_id: u64, to: string, amount_yocto: U128-string})` with the slashed NEAR **attached as deposit**
(desk id defaults to `desk.<this contract>`, repointable by the house with `set_desk`), then `on_desk_paid`:
- desk call succeeded: `payout_route = "evm"`;
- desk call failed or desk account missing (the NEAR comes back here): the slashed sum is paid to the player in NEAR,
  `payout_route = "evm_failed_near"`.
The desk's `pay_evm` must be `#[payable]` and must not panic when `deposit == amount_yocto`.

## Views

`get_season(season_id) -> SeasonView` (panics `E_NO_SEASON`):

```
season_id, player, buyers[5], bonds[{buyer,posted,slashed,refunded}], bond: U128, day, days,
status: "Open"|"Confessed"|"Closed",
lots: [LotView],
leniency_day: u8|null,           // day of the latest window
leniency_open: bool,             // window live right now (yield pending, same day, within 200 blocks, season Open)
leniency_open_block: u64|null,   // NEW: block the live window opened at (null once resolved)
leniency_deadline_block: u64|null,// NEW: open + 200
holdouts: u32,                   // NEW: windows that timed out with no confession
leniency_windows: u32,           // NEW: windows opened so far
first_confessor, verified_signers[], slashed_total: U128, player_payout: U128, shortfall: u64,
pact_cap, pact_nonce: "decimal"|null, confessed_day,
payout_evm: string|null,         // NEW
payout_route: "none"|"near"|"evm_pending"|"evm"|"evm_failed_near"   // NEW
```

`LotView`: `day, species, fair_value, weight_kg (NEW), token_id (NEW, "s{season}-d{day}"), token_owner (NEW: the contract
account while in escrow, then the winner, or the player if returned), committed[], reveals[{buyer,amount}], settled, winner,
price, identical`.

`get_buyer_key(account) -> base64|null`, `get_config() -> {house, version, season_count, max_days, buyers_per_season,
pact_prefix}`.

### NEP-245 views (U2)

One token per lot. Id `s{season_id}-d{day}`, supply = `weight_kg`. Lots are **indivisible**: one holder at a time, so
`mt_transfer` requires the full amount. Escrow holder = the contract account itself.

| View | Returns |
|---|---|
| `mt_metadata_contract()` | `{spec:"mt-1.0.0", name:"Lowball Catch", symbol:"CATCH", icon:null, base_uri:null, reference:null, reference_hash:null}` |
| `mt_token(token_ids[])` | `[ {token_id, owner_id, supply: "42", metadata} \| null ]` |
| `mt_balance_of(account_id, token_id)` | `"42"` or `"0"` |
| `mt_batch_balance_of(account_id, token_ids[])` | `["42","0",...]` |
| `mt_supply(token_id)` / `mt_batch_supply(token_ids[])` | `"42"` or `null` |
| `mt_tokens(from_index?, limit?)` | all tokens in (season, day) order, default limit 50 |
| `mt_tokens_for_owner(account_id, from_index?, limit?)` | tokens currently held (escrow account lists open lots) |
| `mt_metadata_token_by_token_id(token_ids[])` | `[metadata \| null]` |

Token metadata: `title` = `"42 kg Atlantic cod — season 7, day 2"` (the species string exactly as passed to
`open_lot`), `description`, `copies: 1`, `issued_at` (ms since epoch, string), `extra` = JSON string
`{species, weight_kg, fair_value, season_id, day}`, other fields null.

## Events (NEP-297, `EVENT_JSON:` log lines)

Game events: `{"standard":"lowball","version":"1.0.0","event":NAME,"data":[{...}]}` (data = array of one object).

| event | data |
|---|---|
| `leniency_open` | `{season_id, player, day, window, open_block, deadline_block}` |
| `confession` | `{season_id, confessor, day, cap, nonce: "decimal", signers: AccountId[], bond_refunded_yocto}` |
| `slash` | `{season_id, confessor, player, slashed: [{buyer, yocto}], total_yocto, payout_route: "near"\|"evm", payout_evm: string\|null}` |
| `holdout` | `{season_id, day, window, reason: "timeout", holdouts}` (emitted by the yield callback, ~200 blocks after the offer, in a later receipt) |
| `payout_route` | `{season_id, route: "evm"\|"evm_failed_near", amount_yocto}` (desk callback) |

Token events: standard NEP-245 `{"standard":"nep245","version":"1.0.0","event":...}`:

```
mt_mint     data: [{"owner_id":"<contract>","token_ids":["s7-d2"],"amounts":["42"],"memo":"escrow for <player>"}]
mt_transfer data: [{"old_owner_id":"<contract>","new_owner_id":"<winner>","token_ids":["s7-d2"],"amounts":["42"],"memo":"sold at 90 marks"}]
```

`mt_transfer` also fires with memo `returned unsold` (escrow -> player on close/confession with an unsold open lot) and with
the caller's memo for a user `mt_transfer`.

Not implemented (not needed by the game): `mt_transfer_call`, `mt_resolve_transfer`, approvals, `mt_batch_transfer_call`,
partial-amount transfers.
