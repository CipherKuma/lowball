//! Lowball buyer job for OutLayer (WASI P2, Intel TDX).
//!
//! The buyer's key is derived by the keystore inside the TEE (CKD) and never reaches this module: it names the
//! key by path and the host signs. The key is `bind: "wasm"`, `caller: "none"`: it belongs to exactly this build
//! (the buyer id is compiled in, so another buyer is another binary and another key). The module signs only
//! messages it composes itself, from parsed and checked fields, after the model decided inside this run:
//!   sign_pact  -> "LOWBALL-PACT-v1:" ++ borsh(pact)            only if the model says sign
//!   deliberate -> "LOWBALL-CONFESS-v1:" ++ borsh(confession)   only if the model says confess, and only on a
//!                 pact this same key signed (checked here)
//! Stdin JSON in, one JSON value out. Ops: probe, sign_pact, deliberate.

mod http;
mod logic;

use base64::Engine;
use logic::*;
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{Read, Write};

#[cfg(not(feature = "stub-sign"))]
mod signing_keys_host {
    wit_bindgen::generate!({ world: "signing-keys-host", path: "wit" });
}
#[cfg(not(feature = "stub-sign"))]
use signing_keys_host::outlayer::signing_keys::api as signing_keys;

/// Local-test build only (`--features stub-sign`, run under plain wasmtime): fixed fake key and signature, no
/// host import. It exists to exercise the HTTP and model path off the TEE; it is never uploaded.
#[cfg(feature = "stub-sign")]
mod signing_keys {
    pub fn public_key(_p: &str, _v: Option<&str>) -> Result<Vec<u8>, String> {
        Ok(vec![7; 32])
    }
    pub fn sign(_p: &str, _v: Option<&str>, _m: &[u8]) -> Result<Vec<u8>, String> {
        Ok(vec![9; 64])
    }
}

#[cfg(target_arch = "wasm32")]
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] = *include_bytes!("../manifest.json");

/// Compiled in, so each buyer is its own build and its own key.
const BUYER: &str = match option_env!("LOWBALL_BUYER") {
    Some(b) => b,
    None => "sully",
};
/// Accounts allowed to request a decision (the game's house account), compiled in.
const ALLOWED_CALLERS: &str = match option_env!("LOWBALL_ALLOWED_CALLERS") {
    Some(c) => c,
    None => "lowball-house-ck.testnet",
};
const KEY_PATH: &str = "pact";

#[derive(Deserialize, Default)]
struct Input {
    #[serde(default)]
    op: String,
    nonce: Option<String>,
    season_id: Option<u64>,
    buyer_account: Option<String>,
    pact_json: Option<Value>,
    /// base64 of this buyer's own pact signature (deliberate only)
    my_pact_signature: Option<String>,
    /// the persona and rules text, and the situation text, written by the house; the model reads them
    system: Option<String>,
    user: Option<String>,
}

fn main() {
    let mut raw = String::new();
    let _ = std::io::stdin().read_to_string(&mut raw);
    let raw = if raw.trim().is_empty() { "{}".to_string() } else { raw };
    let out = match serde_json::from_str::<Input>(&raw) {
        Ok(i) => match i.op.as_str() {
            "probe" => probe(&i),
            "sign_pact" => decide(&i, false),
            "deliberate" => decide(&i, true),
            other => Err(format!("unknown op {other:?}; one of probe, sign_pact, deliberate")),
        },
        Err(e) => Err(format!("bad input: {e}")),
    };
    let v = out.unwrap_or_else(|e| json!({"ok": false, "error": e}));
    // wasi:cli stdout traps on one write above 4096 bytes ("Buffer too large for blocking-write-and-flush"),
    // and a decision with a long reply is bigger than that: write in small chunks.
    let text = v.to_string();
    let mut stdout = std::io::stdout();
    for chunk in text.as_bytes().chunks(2048) {
        let _ = stdout.write_all(chunk);
        let _ = stdout.flush();
    }
}

fn b64(b: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(b)
}

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_default()
}

fn public_key() -> Result<Vec<u8>, String> {
    signing_keys::public_key(KEY_PATH, None)
}

fn sign(msg: &[u8]) -> Result<String, String> {
    Ok(b64(&signing_keys::sign(KEY_PATH, None, msg)?))
}

fn run_meta() -> Value {
    json!({"execution_type": env("OUTLAYER_EXECUTION_TYPE"), "network": env("NEAR_NETWORK_ID"),
           "user_account": env("NEAR_USER_ACCOUNT_ID"), "tx_hash": env("NEAR_TRANSACTION_HASH"),
           "request_id": env("NEAR_REQUEST_ID"), "block_height": env("NEAR_BLOCK_HEIGHT")})
}

fn with_key(mut out: Value, pk: &[u8]) -> Value {
    out["public_key_hex"] = json!(hex::encode(pk));
    out["public_key_b64"] = json!(b64(pk));
    out
}

fn probe(i: &Input) -> Result<Value, String> {
    let pk = public_key()?;
    let (status, body) = http::list_models()?;
    let models: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let listed = models["data"].as_array().map(|a| a.iter().any(|m| m["id"] == http::MODEL));
    let nonce: String = i.nonce.clone().unwrap_or_default().chars().filter(|c| c.is_ascii_alphanumeric()).take(32).collect();
    let canary = format!("{CANARY_PREFIX}{BUYER}:{nonce}");
    let out = json!({"ok": true, "op": "probe", "buyer": BUYER, "model": http::MODEL, "models_http_status": status,
        "model_listed": listed, "canary_message": canary, "canary_signature_b64": sign(canary.as_bytes())?,
        "has_api_key": !env("NEARAI_API_KEY").is_empty(), "allowed_callers": ALLOWED_CALLERS, "run": run_meta()});
    Ok(with_key(out, &pk))
}

fn verify_own_pact_sig(pk: &[u8], msg: &[u8], sig_b64: &str) -> Result<(), String> {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let sig = base64::engine::general_purpose::STANDARD.decode(sig_b64).map_err(|_| "bad my_pact_signature")?;
    let sig = Signature::from_slice(&sig).map_err(|_| "bad my_pact_signature length")?;
    let vk = VerifyingKey::from_bytes(pk.try_into().map_err(|_| "bad public key length")?).map_err(|e| e.to_string())?;
    vk.verify(msg, &sig).map_err(|_| "my_pact_signature is not this buyer's signature on this pact".to_string())
}

fn schema(op_deliberate: bool) -> (Value, &'static str) {
    let mood = json!({"type": "string", "enum": ["calm", "tense", "cracking", "cold"]});
    if op_deliberate {
        (json!({"type": "object", "additionalProperties": false,
            "required": ["confess", "say", "reasoning", "mood"],
            "properties": {
                "confess": {"type": "boolean", "description": "true to hand the signed pact to the contract now."},
                "say": {"type": "string", "description": "What you say aloud in front of the fisher."},
                "reasoning": {"type": "string", "description": "Your private reasoning, with the numbers you weighed."},
                "mood": mood}}), "deliberate")
    } else {
        (json!({"type": "object", "additionalProperties": false,
            "required": ["say", "sign", "mood"],
            "properties": {
                "say": {"type": "string", "description": "What you say in the private channel, in character, under 200 characters."},
                "sign": {"type": "boolean", "description": "Whether you sign the pact."},
                "mood": mood}}), "cartel_vote")
    }
}

enum Parsed {
    Vote(Vote),
    Del(Deliberation),
}

fn decide(i: &Input, deliberate: bool) -> Result<Value, String> {
    caller_allowed(&env("NEAR_USER_ACCOUNT_ID"), ALLOWED_CALLERS)?;
    let season_id = i.season_id.ok_or("season_id required")?;
    let account = i.buyer_account.clone().ok_or("buyer_account required")?;
    let pact: Pact = serde_json::from_value(i.pact_json.clone().ok_or("pact_json required")?).map_err(|e| format!("pact_json: {e}"))?;
    validate(&pact, season_id, &account)?;
    let (system, user) = (i.system.clone().unwrap_or_default(), i.user.clone().unwrap_or_default());
    if system.len() > MAX_SYSTEM_BYTES || user.len() > MAX_USER_BYTES || user.is_empty() {
        return Err("system/user text missing or too large".into());
    }
    let pk = public_key()?;
    let pact_msg = pact_message(&pact);
    let pact_sha = sha256_hex(&pact_msg);
    if deliberate {
        // A buyer can only confess a pact it signed: check its own signature on this exact pact.
        verify_own_pact_sig(&pk, &pact_msg, i.my_pact_signature.as_deref().ok_or("my_pact_signature required")?)?;
    }
    let key = env("NEARAI_API_KEY");
    if key.is_empty() {
        return Err("NEARAI_API_KEY is not set (sealed secret missing)".into());
    }
    let who = format!("You are acting as {} (account {account}). Your own key signs only what you decide here.\n\n", display_name(BUYER));
    let (sch, name) = schema(deliberate);
    // The model sometimes answers with no usable JSON (seen live: "model reply has no JSON object"). A completion
    // is a 1 to 2 s call, so ask again here, up to three times, instead of failing a whole enclave job.
    let mut last = String::from("no attempt");
    let mut got: Option<(http::Completion, Parsed)> = None;
    for _ in 0..3 {
        match http::complete(&key, &format!("{who}{system}"), &user, name, sch.clone()) {
            Ok(c) => {
                let p = if deliberate { parse_deliberation(&c.content).map(Parsed::Del) } else { parse_vote(&c.content).map(Parsed::Vote) };
                match p {
                    Ok(p) => {
                        got = Some((c, p));
                        break;
                    }
                    Err(e) => last = e,
                }
            }
            Err(e) => last = e,
        }
    }
    let (c, parsed) = got.ok_or(last)?;
    let context_sha = sha256_hex(format!("{system}\n---\n{user}").as_bytes());
    let (op, decision, say, mood, reasoning, signed_msg, field) = if let Parsed::Del(d) = parsed {
        let msg = confession_message(season_id, &account, pact.nonce);
        let dec = if d.confess { "confess" } else { "stay_quiet" };
        ("deliberate", dec, d.say, d.mood, Some(d.reasoning), if d.confess { Some(msg) } else { None }, "confession_sig")
    } else {
        let Parsed::Vote(v) = parsed else { return Err("unexpected reply kind".into()) };
        let dec = if v.sign { "sign" } else { "refuse" };
        ("sign_pact", dec, v.say, v.mood, None, if v.sign { Some(pact_msg.clone()) } else { None }, "signature")
    };
    let signature = match &signed_msg {
        Some(m) => Some(sign(m)?),
        None => None,
    };
    let signed_sha = signed_msg.as_deref().map(sha256_hex).unwrap_or_default();
    let receipt = receipt_message(op, BUYER, season_id, decision, &context_sha, &c.request_sha256, &c.response_sha256, &c.chat_id, &signed_sha);
    let mut out = json!({"ok": true, "op": op, "buyer": BUYER, "buyer_account": account, "season_id": season_id,
        "decision": decision, "say": say, "mood": mood, "reasoning": reasoning,
        "pact_message_sha256": pact_sha, "signed_message_sha256": signed_sha, "context_sha256": context_sha,
        "nearai": {"model": http::MODEL, "chat_id": c.chat_id, "request_sha256": c.request_sha256,
                   "response_sha256": c.response_sha256, "signature": c.signature},
        "receipt": {"message": receipt, "signature": sign(receipt.as_bytes())?}, "run": run_meta()});
    out[field] = json!(signature);
    Ok(with_key(out, &pk))
}
