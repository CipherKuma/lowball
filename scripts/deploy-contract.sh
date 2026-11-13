#!/usr/bin/env bash
# Build, create (faucet-sponsored), deploy and initialise the Lowball contract on NEAR TESTNET.
# Idempotent: accounts that already exist with a key in ~/.near-credentials are reused.
# Never prints or stores private keys (keys live in the near CLI legacy keychain only).
#
#   scripts/deploy-contract.sh                 # lowball-ck.testnet + lowball-house-ck.testnet
#   CONTRACT_ID=x.testnet HOUSE_ID=y.testnet scripts/deploy-contract.sh
#   SKIP_BUILD=1 ...                           # reuse contract/target/near/lowball.wasm
#
# Accounts that do not exist yet stop the script and print the public key already staged in the keychain
# (create the account with that key). USE_FAUCET=1 tries the free faucet instead (new key; 429 = stop).
# There is no paid fallback.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NEAR="${NEAR_BIN:-$HOME/.cargo/bin/near}"   # near-cli-rs
CONTRACT_ID="${CONTRACT_ID:-lowball-ck.testnet}"
HOUSE_ID="${HOUSE_ID:-lowball-house-ck.testnet}"
RPC="${RPC:-https://rpc.testnet.near.org}"
CRED_DIR="$HOME/.near-credentials/testnet"
WASM="$ROOT/contract/target/near/lowball.wasm"
OUT="$ROOT/contract/deployed.json"

[[ "$CONTRACT_ID" == *.testnet && "$HOUSE_ID" == *.testnet ]] || { echo "testnet accounts only" >&2; exit 2; }

[[ "${SKIP_BUILD:-0}" == "1" ]] || "$ROOT/contract/build.sh"
[[ -f "$WASM" ]] || { echo "missing $WASM" >&2; exit 1; }

rpc() { curl -s -X POST "$RPC" -H 'content-type: application/json' -d "$1"; }
exists() {
  rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" | grep -q '"amount"'
}
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

echo "deploying $WASM to $CONTRACT_ID (init: house=$HOUSE_ID)"
DEPLOY_LOG="$(mktemp)"
"$NEAR" contract deploy "$CONTRACT_ID" use-file "$WASM" \
  with-init-call new json-args "{\"house\":\"$HOUSE_ID\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-legacy-keychain send >"$DEPLOY_LOG" 2>&1 \
  || { sed 's/\x1b\[[0-9;]*m//g' "$DEPLOY_LOG" | tail -20 >&2; rm -f "$DEPLOY_LOG"; exit 4; }
DEPLOY_TX="$(sed 's/\x1b\[[0-9;]*m//g' "$DEPLOY_LOG" | grep -oE 'Transaction ID: [A-Za-z0-9]+' | head -1 | awk '{print $3}')"
rm -f "$DEPLOY_LOG"

CODE_HASH="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$CONTRACT_ID\"}}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["code_hash"])')"

CONFIG="$("$NEAR" contract call-function as-read-only "$CONTRACT_ID" get_config json-args '{}' network-config testnet now 2>&1 | sed 's/\x1b\[[0-9;]*m//g')"
echo "$CONFIG" | grep -q "$HOUSE_ID" || { echo "get_config did not return the house: $CONFIG" >&2; exit 5; }
echo "get_config OK:"; echo "$CONFIG"

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
  "rpc": "https://rpc.testnet.near.org",
  "explorer": {
    "contract": f"{base}/address/{contract}",
    "house": f"{base}/address/{house}",
    "deployTx": f"{base}/txns/{tx}" if tx else None,
  },
  "pactPrefix": "LOWBALL-PACT-v1:",
}
json.dump(d, open(out, "w"), indent=2); open(out, "a").write("\n")
print("wrote", out)
EOF
