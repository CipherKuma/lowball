#!/usr/bin/env bash
# Build and deploy the payout desk to desk.lowball-ck.testnet (NEAR TESTNET), then configure it.
#
#   scripts/deploy-desk.sh                 # build, deploy (+ init on first run), derive address, sync config
#   SKIP_BUILD=1 scripts/deploy-desk.sh    # reuse contracts/payout-desk/target/near/payout_desk.wasm
#   DESK_ID=... GAME_ID=... HOUSE_ID=... SIGNER_ID=... overrides
#
# The desk account must already exist and have its key in ~/.near-credentials (the integrator creates it
# from lowball-ck.testnet and funds it: the wasm costs ~1.9 NEAR of storage, so give it at least 3 NEAR).
# Idempotent: when the desk is already initialised only the code is redeployed (state is kept).
# Never prints or stores private keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NEAR="${NEAR_BIN:-$HOME/.cargo/bin/near}"
DESK_ID="${DESK_ID:-desk.lowball-ck.testnet}"
GAME_ID="${GAME_ID:-lowball-ck.testnet}"
HOUSE_ID="${HOUSE_ID:-lowball-house-ck.testnet}"
SIGNER_ID="${SIGNER_ID:-v1.signer-prod.testnet}"
RPCS=(${RPC_URLS//,/ })
[[ ${#RPCS[@]} -gt 0 ]] || RPCS=(https://rpc.testnet.near.org https://near-testnet.drpc.org https://test.rpc.fastnear.com)
CRED_DIR="$HOME/.near-credentials/testnet"
WASM="$ROOT/contracts/payout-desk/target/near/payout_desk.wasm"
OUT="$ROOT/contracts/payout-desk/deployed.json"

[[ "$DESK_ID" == *.testnet && "$GAME_ID" == *.testnet && "$HOUSE_ID" == *.testnet ]] || { echo "testnet accounts only" >&2; exit 2; }
clean() { sed 's/\x1b\[[0-9;]*m//g'; }

rpc() {  # try each provider in turn; print the first JSON answer that is not a rate-limit error
  local body="$1" out
  for u in "${RPCS[@]}"; do
    out="$(curl -s -m 15 -X POST "$u" -H 'content-type: application/json' -d "$body" || true)"
    if [[ -n "$out" ]] && ! grep -q '"code": *-429\|rate limit' <<<"$out"; then echo "$out"; return 0; fi
  done
  return 1
}
exists() { rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" | grep -q '"amount"'; }
code_hash() { rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["code_hash"])'; }
view() {  # view <method> <json args> -> raw JSON result on stdout; non-zero when the call errors
  local args64; args64="$(printf '%s' "$3" | base64)"
  rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$args64\"}}" \
    | python3 -c 'import json,sys; r=json.load(sys.stdin).get("result") or {}; sys.exit(1) if "result" not in r else print(bytes(r["result"]).decode())'
}

[[ "${SKIP_BUILD:-0}" == "1" ]] || "$ROOT/contracts/payout-desk/build.sh"
[[ -f "$WASM" ]] || { echo "missing $WASM" >&2; exit 1; }

exists "$DESK_ID" || { echo "$DESK_ID does not exist on testnet yet: the integrator creates it from $GAME_ID and funds it first." >&2; exit 3; }
[[ -f "$CRED_DIR/$DESK_ID.json" ]] || { echo "$DESK_ID exists but has no key in $CRED_DIR" >&2; exit 3; }
[[ -f "$CRED_DIR/$HOUSE_ID.json" ]] || { echo "house key for $HOUSE_ID missing in $CRED_DIR (needed for configuration calls)" >&2; exit 3; }

LOG="$(mktemp)"; trap 'rm -f "$LOG"' EXIT
if view "$DESK_ID" get_config '{}' >/dev/null 2>&1; then
  echo "desk already initialised: redeploying code only (state kept)"
  "$NEAR" contract deploy "$DESK_ID" use-file "$WASM" without-init-call \
    network-config testnet sign-with-legacy-keychain send >"$LOG" 2>&1 || { clean <"$LOG" | tail -20 >&2; exit 4; }
else
  echo "deploying $WASM to $DESK_ID (owner=$HOUSE_ID game=$GAME_ID signer=$SIGNER_ID)"
  "$NEAR" contract deploy "$DESK_ID" use-file "$WASM" \
    with-init-call new json-args "{\"owner\":\"$HOUSE_ID\",\"game\":\"$GAME_ID\",\"signer\":\"$SIGNER_ID\"}" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
    network-config testnet sign-with-legacy-keychain send >"$LOG" 2>&1 || { clean <"$LOG" | tail -20 >&2; exit 4; }
fi
DEPLOY_TX="$(clean <"$LOG" | grep -oE 'Transaction ID: [A-Za-z0-9]+' | head -1 | awk '{print $3}')"

house_call() {  # house_call <method> <json args>
  "$NEAR" contract call-function as-transaction "$DESK_ID" "$1" json-args "$2" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
    sign-as "$HOUSE_ID" network-config testnet sign-with-legacy-keychain send >"$LOG" 2>&1 || { clean <"$LOG" | tail -20 >&2; exit 5; }
}

echo "asking the MPC signer for the desk's derived key (refresh_derived_address)"
house_call refresh_derived_address '{}'
for i in 1 2 3 4 5 6; do
  sleep 3
  STORED="$(view "$DESK_ID" get_derived_address '{}' | tr -d '"' || true)"
  [[ -n "$STORED" && "$STORED" != "null" ]] && break
done
[[ -n "${STORED:-}" && "$STORED" != "null" ]] || { echo "desk did not store a derived address" >&2; exit 5; }

# Independent check: offline derivation from the MPC root key must equal what the desk stored.
cd "$ROOT/server"
OFFLINE="$(DESK_ID="$DESK_ID" SIGNER_ID="$SIGNER_ID" npx tsx scripts/desk-payout.ts --address | python3 -c 'import json,sys; print(json.load(sys.stdin)["sepoliaAddress"])')"
[[ "$OFFLINE" == "$STORED" ]] || { echo "address mismatch: desk stored $STORED, offline derivation $OFFLINE" >&2; exit 6; }
echo "desk Sepolia address: $STORED (offline derivation agrees)"

echo "syncing nonce and fees from Sepolia"
DESK_ID="$DESK_ID" HOUSE_ID="$HOUSE_ID" npx tsx scripts/desk-payout.ts --sync || echo "sync failed (Sepolia RPC?): run it again before the first payout" >&2

CODE_HASH="$(code_hash "$DESK_ID")"
python3 - "$OUT" "$DESK_ID" "$GAME_ID" "$HOUSE_ID" "$SIGNER_ID" "$CODE_HASH" "${DEPLOY_TX:-}" "$STORED" <<'EOF'
import json, sys, datetime
out, desk, game, house, signer, code_hash, tx, addr = sys.argv[1:9]
base = "https://testnet.nearblocks.io"
d = {
  "network": "testnet", "deskId": desk, "gameId": game, "ownerId": house, "signerId": signer,
  "path": "lowball-desk-v1", "chainId": 11155111, "sepoliaAddress": addr,
  "codeHash": code_hash, "deployTx": tx or None,
  "deployedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
  "explorer": {"desk": f"{base}/address/{desk}", "deployTx": f"{base}/txns/{tx}" if tx else None,
               "sepolia": f"https://sepolia.etherscan.io/address/{addr}"},
}
json.dump(d, open(out, "w"), indent=2); open(out, "a").write("\n")
print("wrote", out)
EOF
