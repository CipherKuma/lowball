//! Recomputes the PACT_ENCODING.md test vector from scratch and checks every field.
mod common;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use common::*;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier};

fn vector() -> std::collections::HashMap<String, String> {
    let md = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../PACT_ENCODING.md")).unwrap();
    let block = md.split("```vector\n").nth(1).expect("vector block").split("```").next().unwrap();
    block
        .lines()
        .filter_map(|l| l.split_once(": "))
        .map(|(k, v)| (k.to_string(), v.trim().to_string()))
        .collect()
}

#[test]
fn pact_encoding_vector_matches() {
    let v = vector();
    let seed: [u8; 32] = hex::decode(&v["secret_key_hex"]).unwrap().try_into().unwrap();
    let sk = SigningKey::from_bytes(&seed);
    assert_eq!(B64.encode(sk.verifying_key().to_bytes()), v["public_key_b64"]);

    let j: serde_json::Value = serde_json::from_str(&v["pact_json"]).unwrap();
    let pact = PactB {
        season_id: j["season_id"].as_u64().unwrap(),
        cap: j["cap"].as_u64().unwrap() as u32,
        members: j["members"].as_array().unwrap().iter().map(|m| m.as_str().unwrap().to_string()).collect(),
        nonce: j["nonce"].as_str().unwrap().parse().unwrap(),
    };
    let msg = pact_message(&pact);
    assert_eq!(hex::encode(&borsh::to_vec(&pact).unwrap()), v["borsh_hex"]);
    assert_eq!(hex::encode(&msg), v["message_hex"]);
    assert!(msg.starts_with(b"LOWBALL-PACT-v1:"));

    let sig = sk.sign(&msg);
    assert_eq!(B64.encode(sig.to_bytes()), v["signature_b64"]);
    let given = Signature::from_slice(&B64.decode(&v["signature_b64"]).unwrap()).unwrap();
    assert!(sk.verifying_key().verify(&msg, &given).is_ok());
}
