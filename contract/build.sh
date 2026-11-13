#!/usr/bin/env bash
# Build contract/target/near/lowball.wasm.
# Rust 1.86 is required: wasm from 1.87+ is rejected by nearcore's VM. `--cfg near` makes
# near-sdk-env use host functions (cargo-near 0.17 does not set it for this dependency set).
set -euo pipefail
cd "$(dirname "$0")"
RUSTFLAGS="--cfg near -C link-arg=-s" cargo +1.86.0 build --release --target wasm32-unknown-unknown -p lowball --locked
mkdir -p target/near
IN=target/wasm32-unknown-unknown/release/lowball.wasm
if command -v wasm-opt >/dev/null; then
  wasm-opt -Oz --signext-lowering "$IN" -o target/near/lowball.wasm
else
  cp "$IN" target/near/lowball.wasm
fi
shasum -a 256 target/near/lowball.wasm
