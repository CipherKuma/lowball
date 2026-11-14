# Sim results (real NEAR AI calls, mocked chain)

Command: `cd server && npm run sim -- --seasons 10 --days 6 --baseline-seasons 4 --offer-days 3,4,5,6 --max-calls 1400 --concurrency 2`
Run: 2026-11-14T07:21:48.155Z, 77s. Model `Qwen/Qwen3.6-35B-A3B-FP8`. NEAR AI completions used: 470 (cap 1400).
Chain: `MockChain`, which enforces the contract rules and error codes in the same order (see src/chain/mock.ts); the real contract is exercised by E2E-RUN.md.
Player policy (immunity arm): offer leniency on days 3, 4, 5, 6 before selling that day's lot; never in the baseline arm. 6-day seasons.

| metric | immunity | no-immunity baseline |
|---|---|---|
| seasons completed (of requested) | 10 of 10 | 4 of 4 |
| pact formation rate | 100% (10/10) | 100% (4/4) |
| mean signers when a pact formed | 4.8 | 5.0 |
| mean pact cap (marks) | 56 | 58 |
| first-confession rate (pact seasons that saw a confession) | 90% (9/10) | n/a (never offered) |
| first-confession day (mean / min / max) | 3.6 / 3 / 6 | n/a |
| mean shortfall per lot (marks, fair value minus price) | 91.7 | 153.4 |
| mean share of lots with identical bids | 86% | 96% |
| mean lots settled per season | 2.9 | 6.0 |

Confessors (immunity arm): marlow 0, odile 3, sully 5, ines 1, deacon 0.

Errors: none

## Per season

```
{"mode":"immunity","pact":true,"signers":5,"cap":60,"daysPlayed":2,"confessionDay":3,"confessor":"odile","offers":1,"shortfallPerLot":116.5,"identicalRate":1}
{"mode":"immunity","pact":true,"signers":5,"cap":50,"daysPlayed":2,"confessionDay":3,"confessor":"sully","offers":1,"shortfallPerLot":72.5,"identicalRate":1}
{"mode":"immunity","pact":true,"signers":5,"cap":80,"daysPlayed":3,"confessionDay":4,"confessor":"sully","offers":2,"shortfallPerLot":71,"identicalRate":1}
{"mode":"immunity","pact":true,"signers":5,"cap":40,"daysPlayed":2,"confessionDay":3,"confessor":"sully","offers":1,"shortfallPerLot":181.5,"identicalRate":1}
{"mode":"immunity","pact":true,"signers":5,"cap":40,"daysPlayed":2,"confessionDay":3,"confessor":"sully","offers":1,"shortfallPerLot":119,"identicalRate":1}
{"mode":"immunity","pact":true,"signers":5,"cap":50,"daysPlayed":2,"confessionDay":3,"confessor":"odile","offers":1,"shortfallPerLot":92.5,"identicalRate":1}
{"mode":"immunity","pact":true,"signers":5,"cap":60,"daysPlayed":3,"confessionDay":4,"confessor":"ines","offers":2,"shortfallPerLot":84.33333333333333,"identicalRate":1}
{"mode":"immunity","pact":true,"signers":5,"cap":80,"daysPlayed":2,"confessionDay":3,"confessor":"sully","offers":1,"shortfallPerLot":76.5,"identicalRate":1}
{"mode":"immunity","pact":true,"signers":4,"cap":60,"daysPlayed":6,"confessionDay":null,"confessor":null,"offers":0,"shortfallPerLot":1.8333333333333333,"identicalRate":0}
{"mode":"immunity","pact":true,"signers":4,"cap":40,"daysPlayed":5,"confessionDay":6,"confessor":"odile","offers":3,"shortfallPerLot":101.6,"identicalRate":0.6}
{"mode":"baseline","pact":true,"signers":5,"cap":60,"daysPlayed":6,"confessionDay":null,"confessor":null,"offers":0,"shortfallPerLot":152,"identicalRate":1}
{"mode":"baseline","pact":true,"signers":5,"cap":60,"daysPlayed":6,"confessionDay":null,"confessor":null,"offers":0,"shortfallPerLot":156.5,"identicalRate":1}
{"mode":"baseline","pact":true,"signers":5,"cap":60,"daysPlayed":6,"confessionDay":null,"confessor":null,"offers":0,"shortfallPerLot":160.83333333333334,"identicalRate":1}
{"mode":"baseline","pact":true,"signers":5,"cap":50,"daysPlayed":6,"confessionDay":null,"confessor":null,"offers":0,"shortfallPerLot":144.33333333333334,"identicalRate":0.8333333333333334}
```

## Adversarial cases (MockChain)

The same cases run against the deployed contract with `npm run adversarial-real` (see README).

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
