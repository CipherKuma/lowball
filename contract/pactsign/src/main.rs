//! pactsign: sign a Lowball pact with an ed25519 secret key.
//!
//!   pactsign keygen
//!   pactsign sign <secret-key-hex> '<pact-json>'
//!
//! Secret key = 32-byte ed25519 seed as hex (a 64-byte NEAR-style secret is accepted; the first
//! 32 bytes are the seed). Prints JSON: public_key_b64, borsh_hex, message_hex, signature_b64.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signer, SigningKey};
use lowball::{pact_message, Pact};
use std::io::Read;

fn signing_key(hex_sk: &str) -> SigningKey {
    let raw = hex::decode(hex_sk.trim()).expect("secret key must be hex");
    assert!(raw.len() == 32 || raw.len() == 64, "secret key must be 32 or 64 bytes");
    SigningKey::from_bytes(raw[..32].try_into().unwrap())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("keygen") => {
            let mut seed = [0u8; 32];
            std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut seed)).expect("urandom");
            let sk = SigningKey::from_bytes(&seed);
            println!(
                "{}",
                serde_json::json!({"secret_key_hex": hex::encode(seed), "public_key_b64": B64.encode(sk.verifying_key().to_bytes())})
            );
        }
        Some("sign") if args.len() == 4 => {
            let sk = signing_key(&args[2]);
            let pact: Pact = serde_json::from_str(&args[3]).expect("pact json");
            let msg = pact_message(&pact);
            let sig = sk.sign(&msg);
            let borsh_hex = hex::encode(&msg[lowball::PACT_PREFIX.len()..]);
            println!(
                "{}",
                serde_json::json!({
                    "public_key_b64": B64.encode(sk.verifying_key().to_bytes()),
                    "borsh_hex": borsh_hex,
                    "message_hex": hex::encode(&msg),
                    "signature_b64": B64.encode(sig.to_bytes()),
                })
            );
        }
        _ => {
            eprintln!("usage: pactsign keygen | pactsign sign <secret-key-hex> '<pact-json>'");
            std::process::exit(2);
        }
    }
}
