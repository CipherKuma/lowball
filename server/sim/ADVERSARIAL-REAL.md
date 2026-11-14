# Adversarial cases against the deployed contract

Contract `lowball-ck.testnet`, run 2026-11-14T06:42:26.445Z. Command: `cd server && npm run adversarial-real`

| case | expected | actual | pass |
|---|---|---|---|
| commit before bond posted | E_NO_BOND | E_NO_BOND | yes |
| open lot before bonds posted | E_BONDS_MISSING | E_BONDS_MISSING | yes |
| create_season with a malformed payout address | E_BAD_EVM | E_BAD_EVM | yes |
| post_bond with wrong deposit | E_BAD_DEPOSIT | E_BAD_DEPOSIT | yes |
| double commit | E_ALREADY_COMMITTED | E_ALREADY_COMMITTED | yes |
| reveal that does not match the commitment | E_BAD_REVEAL | E_BAD_REVEAL | yes |
| confess before leniency is offered | E_NO_LENIENCY | E_NO_LENIENCY | yes |
| pact signed for another season | E_SEASON_MISMATCH | E_SEASON_MISMATCH | yes |
| replayed signatures from another season | E_BAD_SIG | E_BAD_SIG | yes |
| signature by an unregistered key | E_BAD_SIG | E_BAD_SIG | yes |
| pact including a non-season account | E_NOT_MEMBER | E_NOT_MEMBER | yes |
| duplicate signer | E_DUP_SIGNER | E_DUP_SIGNER | yes |
| only one signature (fewer than two) | E_TOO_FEW | E_TOO_FEW | yes |
| confessor own signature missing | E_TOO_FEW | E_TOO_FEW | yes |
| valid confession accepted | ok | ok | yes |
| second confession after the first | E_ALREADY_CONFESSED | E_ALREADY_CONFESSED | yes |
| open lot past the last day | E_PAST_DAYS | E_PAST_DAYS | yes |
| open lot with zero weight | E_BAD_ARGS | E_BAD_ARGS | yes |

18 of 18 as expected.
