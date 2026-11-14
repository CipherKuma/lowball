#!/bin/bash
# Runs the OutLayer CLI against testnet with an isolated HOME, so it never reads or overwrites
# another project's ~/.outlayer credentials.
#   ./ol.sh login-from-near-credentials <account>   # copies the key from ~/.near-credentials, never printed
#   ./ol.sh <any outlayer CLI args>                 # e.g. ./ol.sh whoami
set -euo pipefail
OL_HOME="${OL_HOME:-$HOME/.lowball-outlayer-home}"
mkdir -p "$OL_HOME/.outlayer/testnet"
if [ "${1:-}" = "login-from-near-credentials" ]; then
  acct="${2:?account id}"
  node -e '
    const fs = require("fs");
    const [acct, home] = process.argv.slice(1);
    const src = JSON.parse(fs.readFileSync(`${process.env.HOME}/.near-credentials/testnet/${acct}.json`, "utf8"));
    const pk = src.public_key, sk = src.private_key || src.secret_key;
    fs.writeFileSync(`${home}/.outlayer/testnet/credentials.json`,
      JSON.stringify({account_id: acct, public_key: pk, private_key: sk, contract_id: "outlayer.testnet", auth_type: "near_key"}), {mode: 0o600});
    fs.writeFileSync(`${home}/.outlayer/default-network`, "testnet");
  ' "$acct" "$OL_HOME"
  echo "credentials written to $OL_HOME/.outlayer/testnet (account $acct)"
  exit 0
fi
HOME="$OL_HOME" OUTLAYER_NETWORK=testnet OUTLAYER_RPC_URL="${OUTLAYER_RPC_URL:-https://rpc.testnet.fastnear.com}" exec "${OUTLAYER_BIN:-outlayer}" "$@"
