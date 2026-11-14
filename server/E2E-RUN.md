# E2E run: steps (NOT RUN yet), updated for the contract upgrade

Status: not run. The deploy, the NEAR AI key and the funded desk address belong to the integrator; this is the exact
sequence once they exist. Nothing here deploys anything. Results are written by the script to
`E2E-RUN.result.md` (HTTP mode) or `E2E-RUN.in-process.md`, with every transaction hash; this file stays as the steps.

## Prerequisites (integrator)

1. `contract/deployed.json` exists (`lowball-ck.testnet`, house `lowball-house-ck.testnet`) and the upgraded wasm is deployed
   (`open_lot` with `weight_kg`, yield `offer_leniency`, NEP-245 tokens, `payout_evm`).
2. Optional cross-chain leg: `desk.lowball-ck.testnet` deployed and `set_desk` points at it; the desk's derived Sepolia
   address is funded with test ETH; `npx tsx scripts/desk-payout.ts --address` shows it and `--sync` sets its nonce and fees.
3. Secrets in the vault: `NEARAI_API_KEY`, `ELEVENLABS_API_KEY`; buyer keys in `~/.lowball-secrets/<contract>.json` from step 4.

## Steps (from `server/`)

```bash
npm install
npm run sync                      # contract/deployed.json -> src/generated/config.json, voices
npm run setup-accounts            # marlow|odile|sully|ines|deacon.<house>, register_buyer_key; prints wrangler secret commands
~/.claude/vault/inject.sh get NEARAI_API_KEY ELEVENLABS_API_KEY --dir server   # writes .env.local
cp .dev.vars.example .dev.vars    # then copy HOUSE_PRIVATE_KEY, BUYER_KEYS_JSON, NEARAI_API_KEY, ELEVENLABS_API_KEY in (gitignored)
npm run db:migrate                # local D1: 0001_init and 0002_spend (spend ledger, voice counter)
npm run adversarial-real          # refusal cases against the deployed contract -> sim/ADVERSARIAL-REAL.md
npm run e2e -- --in-process       # real testnet, SCRIPTED buyers: chain path only -> E2E-RUN.in-process.md
npm run dev                       # Worker on http://localhost:8787 (leave running)
```

Then, in another shell:

```bash
# Real NEAR AI buyers + real testnet. Day 2: the player key signs offer_leniency (INCLUDED only), buyers deliberate.
npm run e2e -- --base http://localhost:8787
# Same with the cross-chain payout to a Sepolia address you control:
npm run e2e -- --base http://localhost:8787 --payout-evm 0xYourSepoliaAddress
```

## What a good run shows

| check | where |
|---|---|
| `lot_minted` after each `day_opened` (token `s<season>-d<day>`, amount = kg) and `lot_transferred` after each `lot_settled` | event list in `E2E-RUN.result.md` |
| `leniency_open` carries `deadlineBlock` (open + 200) | printed live |
| holdout run (no confession): `holdout reason timeout`, only after the contract closed the window (`holdouts` in the final `chain` view is 1) | printed live; the e2e keeps polling while `status.finalizing` |
| confession run: `confession_attempt`, `slashed`, then with `--payout-evm` a `payout_evm` (Sepolia hash, `status success`), then `season_closed` | printed live |
| spend ledger: `npx wrangler d1 execute lowball --local --persist-to .wrangler/state --command "select count(*), round(sum(usd),4) from spend"` | cents per season; compare with `NEARAI_BUDGET_USD` |
| budget refusal: set `NEARAI_BUDGET_USD="0.0001"` in `wrangler.toml` vars, restart, `POST /api/session` answers `402 {"code":"BUDGET_EXHAUSTED"}` | curl |

## Known limits of the unrun path

- `offer_leniency` verification polls `get_season` for the open window; the contract's real RPC response shape for
  `wait_until: INCLUDED` was not observed (no deployed contract): the code accepts both an outcome-less and an outcome-carrying reply,
  and fails closed (`TX_FAILED`) if the window never opens within about 36 s.
- A confession race with `--payout-evm` waits for the desk callback and the MPC signature; if either is late the request
  returns with `status.finalizing` and the events polls finish it (up to 4 minutes before it gives up with
  `PAYOUT_EVM_FAILED`).
