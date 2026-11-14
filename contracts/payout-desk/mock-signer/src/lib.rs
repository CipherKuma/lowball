//! Sandbox stand-in for the MPC signer. Same wire shapes as v1.signer-prod.testnet 3.x:
//! `sign({request:{path,payload_v2:{Ecdsa},domain_id}})` (1 yocto) returns
//! `{scheme:"Secp256k1", big_r:{affine_point}, s:{scalar}, recovery_id}`;
//! `derived_public_key({path,predecessor,domain_id})` returns `"secp256k1:<base58 X||Y>"`.
//! It ignores path/predecessor and signs with one fixed key (a real MPC derives per caller).

use k256::ecdsa::SigningKey;
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, AccountId, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockSigner {
    key: Vec<u8>,
    other_key: Vec<u8>,
    /// "ok" | "fail" (panic like an MPC timeout) | "wrong_key" (valid signature by another key).
    mode: String,
}

fn pubkey64(sk: &SigningKey) -> Vec<u8> {
    sk.verifying_key().to_encoded_point(false).as_bytes()[1..].to_vec()
}

#[near]
impl MockSigner {
    #[init]
    pub fn new(secret_hex: String, other_secret_hex: String) -> Self {
        Self { key: hex::decode(secret_hex).unwrap(), other_key: hex::decode(other_secret_hex).unwrap(), mode: "ok".into() }
    }

    pub fn set_mode(&mut self, mode: String) {
        self.mode = mode;
    }

    pub fn derived_public_key(&self, path: String, predecessor: AccountId, domain_id: u32) -> String {
        let _ = (path, predecessor, domain_id);
        let sk = SigningKey::from_slice(&self.key).unwrap();
        format!("secp256k1:{}", near_sdk::bs58::encode(pubkey64(&sk)).into_string())
    }

    #[payable]
    pub fn sign(&mut self, request: Value) -> Value {
        assert_eq!(env::attached_deposit().as_yoctonear(), 1, "requires 1 yocto");
        assert!(env::prepaid_gas().as_tgas() >= 15, "attach more gas");
        if self.mode == "fail" {
            env::panic_str("mock MPC timeout");
        }
        let hex_payload = request["payload_v2"]["Ecdsa"].as_str().expect("payload_v2.Ecdsa");
        assert_eq!(request["domain_id"].as_u64(), Some(0));
        let digest = hex::decode(hex_payload).expect("hex");
        let secret = if self.mode == "wrong_key" { &self.other_key } else { &self.key };
        let sk = SigningKey::from_slice(secret).unwrap();
        let (sig, rec) = sk.sign_prehash_recoverable(&digest).expect("sign");
        let (r, s) = sig.split_bytes();
        let mut big_r = vec![0x02 | (rec.to_byte() & 1)];
        big_r.extend_from_slice(&r);
        json!({
            "scheme": "Secp256k1",
            "big_r": {"affine_point": hex::encode(big_r).to_uppercase()},
            "s": {"scalar": hex::encode(s).to_uppercase()},
            "recovery_id": rec.to_byte(),
        })
    }
}
