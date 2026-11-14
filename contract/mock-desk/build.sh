#!/usr/bin/env bash
# Build contract/mock-desk/target/mock_desk.wasm (test double only; never deployed to testnet).
set -euo pipefail
cd "$(dirname "$0")"
RUSTFLAGS="--cfg near -C link-arg=-s" cargo +1.86.0 build --release --target wasm32-unknown-unknown --locked
cp target/wasm32-unknown-unknown/release/mock_desk.wasm target/mock_desk.wasm
