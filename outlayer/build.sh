#!/bin/bash
# Builds one wasm per buyer into out/lowball-buyer-<buyer>.wasm and prints its sha256.
# The buyer id is compiled in (LOWBALL_BUYER), so each buyer is its own build and its own TEE key.
#   ./build.sh            -> sully only
#   ./build.sh all        -> marlow odile sully ines deacon
set -euo pipefail
cd "$(dirname "$0")"
rustup target add wasm32-wasip2 2>/dev/null || true
mkdir -p out
buyers="sully"
[ "${1:-}" = "all" ] && buyers="marlow odile sully ines deacon"
for b in $buyers; do
  LOWBALL_BUYER="$b" cargo build --target wasm32-wasip2 --release
  cp target/wasm32-wasip2/release/lowball-buyer.wasm "out/lowball-buyer-$b.wasm"
  grep -qa outlayer.manifest "out/lowball-buyer-$b.wasm" || { echo "manifest section missing"; exit 1; }
  echo "$b  $(wc -c < out/lowball-buyer-$b.wasm) bytes  sha256=$(shasum -a 256 out/lowball-buyer-$b.wasm | cut -d' ' -f1)"
  touch src/main.rs   # option_env! is read at compile time; force a rebuild for the next buyer
done
