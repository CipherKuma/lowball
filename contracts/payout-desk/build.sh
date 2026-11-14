#!/usr/bin/env bash
# Build target/near/payout_desk.wasm (and mock_signer.wasm for sandbox tests with BUILD_MOCK=1).
# Same recipe as contract/build.sh: Rust 1.86 (wasm from 1.87+ is rejected by nearcore's VM) and
# `--cfg near` (cargo-near 0.17 does not set it for this dependency set).
set -euo pipefail
cd "$(dirname "$0")"
PKGS=(-p payout-desk)
[[ "${BUILD_MOCK:-0}" == "1" ]] && PKGS+=(-p mock-signer)
RUSTFLAGS="--cfg near -C link-arg=-s" cargo +1.86.0 build --release --target wasm32-unknown-unknown "${PKGS[@]}" --locked
mkdir -p target/near
for f in payout_desk mock_signer; do
  IN=target/wasm32-unknown-unknown/release/$f.wasm
  [[ -f "$IN" ]] || continue
  if command -v wasm-opt >/dev/null; then wasm-opt -Oz --signext-lowering "$IN" -o target/near/$f.wasm; else cp "$IN" target/near/$f.wasm; fi
  shasum -a 256 target/near/$f.wasm
done
