#!/usr/bin/env bash
# Build, create (faucet-sponsored), deploy and initialise the Lowball contract on NEAR TESTNET.
# Idempotent: accounts that already exist with a key in ~/.near-credentials are reused.
# Never prints or stores private keys (keys live in the near CLI legacy keychain only).
#
#   scripts/deploy-contract.sh                 # lowball-ck.testnet + lowball-house-ck.testnet
#   CONTRACT_ID=x.testnet HOUSE_ID=y.testnet scripts/deploy-contract.sh
#   SKIP_BUILD=1 ...                           # reuse contract/target/near/lowball.wasm
#   FORCE_RESET=1 ...                          # wipe an existing contract's state even if seasons exist
#
# Redeploy rules: a fresh account gets `new`; an account that already runs a contract gets the new code
# deployed, then `get_config` is read; if the old state no longer deserialises (layout changed) the contract
# account calls `reset` on itself (state wipe). That is refused when the old contract reports seasons
# unless FORCE_RESET=1 (bonds could be locked in them).
#
# Accounts that do not exist yet stop the script and print the public key already staged in the keychain
# (create the account with that key). USE_FAUCET=1 tries the free faucet instead (new key; 429 = stop).
# There is no paid fallback.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NEAR="${NEAR_BIN:-$HOME/.cargo/bin/near}"   # near-cli-rs
CONTRACT_ID="${CONTRACT_ID:-lowball-ck.testnet}"
HOUSE_ID="${HOUSE_ID:-lowball-house-ck.testnet}"
# rpc.testnet.near.org is deprecated (429); try several public endpoints in order.
RPCS="${RPCS:-https://archival-rpc.testnet.near.org https://near-testnet.drpc.org https://test.rpc.fastnear.com https://rpc.testnet.near.org}"
CRED_DIR="$HOME/.near-credentials/testnet"
WASM="$ROOT/contract/target/near/lowball.wasm"
OUT="$ROOT/contract/deployed.json"

[[ "$CONTRACT_ID" == *.testnet && "$HOUSE_ID" == *.testnet ]] || { echo "testnet accounts only" >&2; exit 2; }

[[ "${SKIP_BUILD:-0}" == "1" ]] || "$ROOT/contract/build.sh"
[[ -f "$WASM" ]] || { echo "missing $WASM" >&2; exit 1; }

rpc() {  # first endpoint that answers with a result or a definitive UNKNOWN_ACCOUNT
  local u r
  for u in $RPCS; do
    r="$(curl -s -m 15 -X POST "$u" -H 'content-type: application/json' -d "$1" || true)"
    if grep -q '"result"\|UNKNOWN_ACCOUNT' <<<"$r"; then echo "$r"; return 0; fi
  done
  return 1
}
view_account() {
  rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}"
}
exists() { view_account "$1" | grep -q '"amount"'; }
code_hash_of() { view_account "$1" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["code_hash"])'; }
NO_CODE=11111111111111111111111111111111
get_config() {  # prints get_config JSON, or fails when the view errors (e.g. state layout mismatch)
  local r; r="$("$NEAR" contract call-function as-read-only "$CONTRACT_ID" get_config json-args '{}' network-config testnet now 2>&1 | sed 's/\x1b\[[0-9;]*m//g')"
  grep -q '"season_count"' <<<"$r" || return 1
  echo "$r"
}
season_count() { python3 -c 'import re,sys; m=re.search(r"season_count\W+(\d+)", sys.stdin.read()); print(m.group(1) if m else "")'; }
have_key() { [[ -f "$CRED_DIR/$1.json" ]]; }

pubkey_of() {  # public key only, from the legacy keychain file (never the secret)
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("public_key",""))' "$CRED_DIR/$1.json" 2>/dev/null || true
}

ensure_account() {
  local id="$1"
  if exists "$id"; then
    have_key "$id" || { echo "$id exists on testnet but no key in $CRED_DIR: choose another id" >&2; exit 1; }
    echo "reusing $id (public key $(pubkey_of "$id"))"; return
  fi
  if [[ "${USE_FAUCET:-0}" != "1" ]]; then
    echo "$id does not exist on testnet yet. Create + fund it (full-access key = the public key below, held in the" >&2
    echo "near CLI legacy keychain), or run with USE_FAUCET=1 to try the free faucet (generates a NEW key):" >&2
    echo "  public key: $(pubkey_of "$id")" >&2
    exit 3
  fi
  echo "creating $id via faucet sponsorship"
  local log; log="$(mktemp)"
  if ! "$NEAR" account create-account sponsor-by-faucet-service "$id" autogenerate-new-keypair \
        save-to-legacy-keychain network-config testnet create >"$log" 2>&1; then
    grep -E "Error|status code|retry" "$log" | sed 's/\x1b\[[0-9;]*m//g' >&2 || true
    echo "faucet creation failed for $id (see above). Free route only: retry later." >&2
    rm -f "$log"; exit 3
  fi
  rm -f "$log"
  exists "$id" || { echo "$id not visible on chain after creation" >&2; exit 1; }
}

ensure_account "$HOUSE_ID"
ensure_account "$CONTRACT_ID"

PRE_HASH="$(code_hash_of "$CONTRACT_ID")"
INIT_ARGS=(with-init-call new json-args "{\"house\":\"$HOUSE_ID\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR')
if [[ "$PRE_HASH" == "$NO_CODE" ]]; then
  MODE=fresh
else
  MODE=redeploy
  OLD="$(get_config || true)"
  OLD_SEASONS="$(season_count <<<"$OLD")"
  if [[ -n "$OLD_SEASONS" && "$OLD_SEASONS" != "0" && "${FORCE_RESET:-0}" != "1" ]]; then
    echo "existing contract has $OLD_SEASONS season(s); a layout change would need a state wipe. Set FORCE_RESET=1 to allow." >&2
    echo "(a compatible upgrade can be done by hand: near contract deploy $CONTRACT_ID use-file $WASM without-init-call ...)" >&2
    exit 6
  fi
fi

echo "deploying $WASM to $CONTRACT_ID (mode: $MODE, house=$HOUSE_ID)"
DEPLOY_LOG="$(mktemp)"
if [[ "$MODE" == fresh ]]; then
  "$NEAR" contract deploy "$CONTRACT_ID" use-file "$WASM" "${INIT_ARGS[@]}" \
    network-config testnet sign-with-legacy-keychain send >"$DEPLOY_LOG" 2>&1 \
    || { sed 's/\x1b\[[0-9;]*m//g' "$DEPLOY_LOG" | tail -20 >&2; rm -f "$DEPLOY_LOG"; exit 4; }
else
  "$NEAR" contract deploy "$CONTRACT_ID" use-file "$WASM" without-init-call \
    network-config testnet sign-with-legacy-keychain send >"$DEPLOY_LOG" 2>&1 \
    || { sed 's/\x1b\[[0-9;]*m//g' "$DEPLOY_LOG" | tail -20 >&2; rm -f "$DEPLOY_LOG"; exit 4; }
fi
DEPLOY_TX="$(sed 's/\x1b\[[0-9;]*m//g' "$DEPLOY_LOG" | grep -oE 'Transaction ID: [A-Za-z0-9]+' | head -1 | awk '{print $3}')"
rm -f "$DEPLOY_LOG"

if [[ "$MODE" == redeploy ]] && ! get_config >/dev/null; then
  echo "old state does not deserialise under the new code: wiping with reset (no seasons existed)" >&2
  RESET_LOG="$(mktemp)"
  "$NEAR" contract call-function as-transaction "$CONTRACT_ID" reset json-args "{\"house\":\"$HOUSE_ID\"}" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$CONTRACT_ID" network-config testnet \
    sign-with-legacy-keychain send >"$RESET_LOG" 2>&1 \
    || { sed 's/\x1b\[[0-9;]*m//g' "$RESET_LOG" | tail -20 >&2; rm -f "$RESET_LOG"; exit 7; }
  rm -f "$RESET_LOG"
fi

CODE_HASH="$(code_hash_of "$CONTRACT_ID")"

CONFIG="$(get_config || true)"
grep -q "$HOUSE_ID" <<<"$CONFIG" || { echo "get_config did not return the house: $CONFIG" >&2; exit 5; }
echo "get_config OK:"; echo "$CONFIG"
"$NEAR" contract call-function as-read-only "$CONTRACT_ID" mt_metadata_contract json-args '{}' network-config testnet now 2>&1 \
  | sed 's/\x1b\[[0-9;]*m//g' | grep -q 'CATCH' || { echo "mt_metadata_contract (NEP-245) not answering" >&2; exit 8; }
echo "NEP-245 metadata OK"

python3 - "$OUT" "$CONTRACT_ID" "$HOUSE_ID" "$CODE_HASH" "${DEPLOY_TX:-}" <<'EOF'
import json, sys, datetime
out, contract, house, code_hash, tx = sys.argv[1:6]
base = "https://testnet.nearblocks.io"
d = {
  "network": "testnet",
  "contractId": contract,
  "houseId": house,
  "codeHash": code_hash,
  "deployTx": tx or None,
  "deployedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
  "rpc": "https://archival-rpc.testnet.near.org",
  "explorer": {
    "contract": f"{base}/address/{contract}",
    "house": f"{base}/address/{house}",
    "deployTx": f"{base}/txns/{tx}" if tx else None,
  },
  "pactPrefix": "LOWBALL-PACT-v1:",
  "deskAccountId": f"desk.{contract}",
  "standards": ["NEP-245 (mt-1.0.0, indivisible lots)", "NEP-519 yield/resume", "NEP-297 events"],
}
json.dump(d, open(out, "w"), indent=2); open(out, "a").write("\n")
print("wrote", out)
EOF
