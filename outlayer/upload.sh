#!/bin/bash
# Uploads out/lowball-buyer-<buyer>.wasm to FastFS (testnet) and checks the URL serves the full file.
#   ./upload.sh marlow odile sully ines deacon        (needs ./ol.sh login-from-near-credentials first)
# Prints "<buyer> <sha256> <url>" per buyer. A partial upload makes a job fail with `wasm_url could not be fetched`.
set -uo pipefail
cd "$(dirname "$0")"
OWNER="${OUTLAYER_UPLOAD_ACCOUNT:-outlayer.lowball-house-ck.testnet}"
for b in "$@"; do
  f="out/lowball-buyer-$b.wasm"
  sha=$(shasum -a 256 "$f" | cut -d' ' -f1)
  size=$(wc -c < "$f" | tr -d ' ')
  url="https://test.fastfs.io/$OWNER/outlayer.testnet/$sha.wasm"
  ok=0
  for attempt in 1 2 3 4 5 6; do
    got=$(curl -sS -m 30 -o /dev/null -w '%{http_code} %{size_download}' "$url" || true)
    if [ "$got" = "200 $size" ]; then ok=1; break; fi
    for rpc in https://rpc.testnet.fastnear.com https://rpc.testnet.near.org; do
      OUTLAYER_RPC_URL=$rpc ./ol.sh upload "$f" > /dev/null 2>&1 && break
      sleep 8
    done
    sleep 8
  done
  if [ $ok -eq 1 ]; then echo "$b $sha $url"; else echo "$b FAILED (last check: $got)"; exit 1; fi
done
