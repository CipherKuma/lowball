#![allow(dead_code, unused_must_use)]
//! Shared sandbox harness: deploys the built wasm and builds the five buyers with pact keys.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use borsh::BorshSerialize;
use ed25519_dalek::{Signer, SigningKey};
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::{network::Sandbox, Account, AccountId, Contract, Worker};
use near_workspaces::types::NearToken;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const BOND: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR
pub const NAMES: [&str; 5] = ["marlow", "odile", "sully", "ines", "deacon"];
pub const PREFIX: &[u8] = b"LOWBALL-PACT-v1:";

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub contract: Contract,
    pub house: Account,
    pub player: Account,
    pub buyers: Vec<Account>,
    pub keys: Vec<SigningKey>,
}

/// Borsh layout identical to the contract's `Pact` (AccountId borsh = String borsh).
#[derive(BorshSerialize, Clone)]
pub struct PactB {
    pub season_id: u64,
    pub cap: u32,
    pub members: Vec<String>,
    pub nonce: u64,
}

pub fn pact_message(p: &PactB) -> Vec<u8> {
    let mut m = PREFIX.to_vec();
    m.extend(borsh::to_vec(p).unwrap());
    m
}

pub fn pact_json(p: &PactB) -> Value {
    json!({"season_id": p.season_id, "cap": p.cap, "members": p.members, "nonce": p.nonce.to_string()})
}

pub fn sig_json(signer: &AccountId, key: &SigningKey, p: &PactB) -> Value {
    let sig = key.sign(&pact_message(p));
    json!({"signer": signer, "signature": B64.encode(sig.to_bytes())})
}

pub fn b64(v: &[u8]) -> String {
    B64.encode(v)
}

pub fn commit_hash(amount: u32, salt: &[u8; 32]) -> String {
    let mut h = Sha256::new();
    h.update(amount.to_le_bytes());
    h.update(salt);
    B64.encode(h.finalize())
}

pub fn key_for(i: usize) -> SigningKey {
    SigningKey::from_bytes(&[i as u8 + 1; 32])
}

pub async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let wasm = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../target/near/lowball.wasm"))?;
    let mk = |n: &'static str, near: u128| {
        let root = root.clone();
        async move {
            Ok::<_, anyhow::Error>(
                root.create_subaccount(n).initial_balance(NearToken::from_near(near)).transact().await?.into_result()?,
            )
        }
    };
    let contract = mk("lowball", 50).await?.deploy(&wasm).await?.into_result()?;
    let house = mk("house", 30).await?;
    let player = mk("player", 10).await?;
    let mut buyers = vec![];
    for n in NAMES {
        buyers.push(mk(n, 20).await?);
    }
    contract.call("new").args_json(json!({"house": house.id()})).transact().await?.into_result()?;
    let keys: Vec<SigningKey> = (0..5).map(key_for).collect();
    for (b, k) in buyers.iter().zip(&keys) {
        b.call(contract.id(), "register_buyer_key")
            .args_json(json!({"public_key": b64(&k.verifying_key().to_bytes())}))
            .transact()
            .await?
            .into_result()?;
    }
    Ok(Env { worker, contract, house, player, buyers, keys })
}

/// Extract the stable error code from a failed execution (panic string `E_...`).
pub fn err_code(res: &ExecutionFinalResult) -> Option<String> {
    let text = format!("{:?}", res.failures());
    let start = text.find("E_")?;
    Some(text[start..].chars().take_while(|c| c.is_ascii_uppercase() || *c == '_').collect())
}

#[track_caller]
pub fn assert_code(res: ExecutionFinalResult, code: &str) {
    assert!(res.is_failure(), "expected {code}, but call succeeded");
    assert_eq!(err_code(&res).as_deref(), Some(code), "failures: {:?}", res.failures());
}

impl Env {
    pub fn ids(&self) -> Vec<AccountId> {
        self.buyers.iter().map(|b| b.id().clone()).collect()
    }

    pub async fn call(&self, who: &Account, method: &str, args: Value) -> ExecutionFinalResult {
        who.call(self.contract.id(), method).args_json(args).max_gas().transact().await.unwrap()
    }

    pub async fn ok(&self, who: &Account, method: &str, args: Value) -> ExecutionFinalResult {
        let r = self.call(who, method, args).await;
        assert!(r.is_success(), "{method} failed: {:?}", r.failures());
        r
    }

    pub async fn season(&self, id: u64) -> Value {
        self.contract.view("get_season").args_json(json!({"season_id": id})).await.unwrap().json().unwrap()
    }

    /// Balance after letting every pending receipt (transfers, gas refunds) land.
    pub async fn balance(&self, a: &Account) -> u128 {
        self.worker.fast_forward(3).await.unwrap();
        a.view_account().await.unwrap().balance.as_yoctonear()
    }

    pub async fn create_season(&self, days: u8) -> u64 {
        let r = self
            .ok(&self.house, "create_season", json!({"player": self.player.id(), "buyers": self.ids(), "days": days, "bond": BOND.to_string()}))
            .await;
        r.json().unwrap()
    }

    pub async fn post_bonds(&self, sid: u64) {
        for b in &self.buyers {
            let r = b
                .call(self.contract.id(), "post_bond")
                .args_json(json!({"season_id": sid}))
                .deposit(NearToken::from_yoctonear(BOND))
                .max_gas()
                .transact()
                .await
                .unwrap();
            assert!(r.is_success(), "{:?}", r.failures());
        }
    }

    /// Open a lot, every buyer commits+reveals `amounts[i]`, then settle.
    pub async fn play_lot(&self, sid: u64, fair: u32, amounts: [u32; 5]) {
        self.ok(&self.house, "open_lot", json!({"season_id": sid, "species": "Hake", "fair_value": fair})).await;
        for (i, b) in self.buyers.iter().enumerate() {
            let salt = [i as u8 + 9; 32];
            self.ok(b, "commit_bid", json!({"season_id": sid, "hash": commit_hash(amounts[i], &salt)})).await;
        }
        for (i, b) in self.buyers.iter().enumerate() {
            let salt = [i as u8 + 9; 32];
            self.ok(b, "reveal_bid", json!({"season_id": sid, "amount": amounts[i], "salt": b64(&salt)})).await;
        }
        self.ok(&self.buyers[0], "settle_lot", json!({"season_id": sid})).await;
    }

    pub fn pact(&self, sid: u64, members: &[usize]) -> PactB {
        PactB {
            season_id: sid,
            cap: 40,
            members: members.iter().map(|&i| self.buyers[i].id().to_string()).collect(),
            nonce: 0xFEED_FACE_CAFE_BEEF,
        }
    }

    pub fn sigs(&self, p: &PactB, signers: &[usize]) -> Value {
        Value::Array(signers.iter().map(|&i| sig_json(self.buyers[i].id(), &self.keys[i], p)).collect())
    }

    pub async fn confess(&self, sid: u64, who: usize, p: &PactB, signers: &[usize]) -> ExecutionFinalResult {
        self.call(&self.buyers[who], "confess", json!({"season_id": sid, "pact": pact_json(p), "signatures": self.sigs(p, signers)})).await
    }

    /// Season at day 1 with identical low bids settled and the leniency window open.
    pub async fn leniency_ready(&self, days: u8) -> u64 {
        let sid = self.create_season(days).await;
        self.post_bonds(sid).await;
        self.play_lot(sid, 100, [40; 5]).await;
        self.ok(&self.player, "offer_leniency", json!({"season_id": sid})).await;
        sid
    }
}
