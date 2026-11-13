# E2E run: NOT RUN (blocked), 2026-11-14

No transaction hashes are recorded because no run happened. Two external dependencies were missing:

1. **Testnet accounts do not exist.** `contract/deployed.json` is absent. `lowball-ck.testnet` and
   `lowball-house-ck.testnet` are not on chain (RPC `UNKNOWN_ACCOUNT`); the faucet at
   `helper.nearprotocol.com` / `helper.testnet.near.org` answers `429 Rate limit exceeded, retry in 12 hours`
   for this machine's IP, so no funded house account can be created for free. Needs: a funded testnet house
   account (faucet from another IP, or a transfer), then `scripts/deploy-contract.sh`.
2. **`NEARAI_API_KEY` is not in the vault** (`inject.sh has` reports not found), so there is no real buyer
   model to run the HTTP mode against.

Once both exist, from `server/`:

```bash
npm run sync && npm run setup-accounts      # buyer subaccounts + register_buyer_key
npm run adversarial-real                    # refusal cases against the deployed contract
npm run e2e -- --in-process                 # real testnet + SCRIPTED buyers (chain path only) -> E2E-RUN.in-process.md
npm run db:migrate && npm run dev           # then, in another shell:
npm run e2e -- --base http://localhost:8787 # real NEAR AI + testnet, leniency offered on day 2 -> E2E-RUN.md
npm run sim -- --seasons 10 --days 20 --baseline-seasons 5 --max-calls 1500
```
