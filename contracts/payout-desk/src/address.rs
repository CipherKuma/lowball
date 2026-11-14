//! Ethereum address helpers: derivation from a secp256k1 public key and EIP-55 checksum casing.

use near_sdk::env;

/// Ethereum address = last 20 bytes of keccak256(X || Y). `pubkey` is the 64-byte uncompressed key
/// without the 0x04 prefix (NEAR's `secp256k1:` key format and `ecrecover`'s output).
pub fn eth_address_from_pubkey(pubkey: &[u8]) -> [u8; 20] {
    let h = env::keccak256_array(pubkey);
    let mut out = [0u8; 20];
    out.copy_from_slice(&h[12..]);
    out
}

/// EIP-55 mixed-case checksum address string.
pub fn eip55(addr: &[u8; 20]) -> String {
    let lower = hex::encode(addr);
    let h = env::keccak256_array(lower.as_bytes());
    let mut out = String::from("0x");
    for (i, c) in lower.chars().enumerate() {
        let nib = if i % 2 == 0 { h[i / 2] >> 4 } else { h[i / 2] & 0x0f };
        out.push(if c.is_ascii_alphabetic() && nib >= 8 { c.to_ascii_uppercase() } else { c });
    }
    out
}
