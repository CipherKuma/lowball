//! Lowball buyer job for OutLayer (WASI P2, Intel TDX).
//!
//! The pact signing key is derived by the keystore inside the TEE (CKD) and never reaches this
//! module: it names the key by path and the host signs. The key is `bind: "wasm"`, `caller: "none"`,
//! so it belongs to exactly this build (the buyer id is compiled in: another buyer is another
//! binary, another sha256, another key) and is the same for every caller.
//!
//! Ops (stdin JSON, stdout one JSON value):
//!   probe  {nonce?}                      public key, outbound HTTPS to NEAR AI Cloud, a canary signature
//!   decide {season_id, round, buyer_account, pact_json, decision_context}
//!                                        asks the model, signs the pact only on "sign"

mod logic;

use logic::*;
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::time::Duration;

mod signing_keys_host {
    wit_bindgen::generate!({ world: "signing-keys-host", path: "wit" });
}
use signing_keys_host::outlayer::signing_keys::api as signing_keys;

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
    None => "lowball-house-ck.testnet,outlayer.lowball-house-ck.testnet",
};
const MODEL: &str = "z-ai/glm-5.3-flash";
const API: &str = "https://cloud-api.near.ai/v1";
const KEY_PATH: &str = "pact";

#[derive(Deserialize, Default)]
struct Input {
    #[serde(default)]
    op: String,
    nonce: Option<String>,
    season_id: Option<u64>,
    round: Option<u64>,
    buyer_account: Option<String>,
    pact_json: Option<Value>,
    decision_context: Option<Value>,
}

fn main() {
    let mut raw = String::new();
    let _ = std::io::stdin().read_to_string(&mut raw);
    let raw = if raw.trim().is_empty() { "{}".to_string() } else { raw };
    let out = match serde_json::from_str::<Input>(&raw) {
        Ok(i) => match i.op.as_str() {
            "probe" => probe(&i),
            "decide" => decide(&i),
            other => Err(format!("unknown op {other:?}; one of probe, decide")),
        },
        Err(e) => Err(format!("bad input: {e}")),
    };
    let v = out.unwrap_or_else(|e| json!({"ok": false, "error": e}));
    print!("{v}");
    let _ = std::io::stdout().flush();
}

fn public_key() -> Result<Vec<u8>, String> {
    signing_keys::public_key(KEY_PATH, None)
}

fn key_fields(pk: &[u8]) -> Value {
    use base64::Engine;
    json!({"public_key_hex": hex::encode(pk),
           "public_key_b64": base64::engine::general_purpose::STANDARD.encode(pk)})
}

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_default()
}

fn run_meta() -> Value {
    json!({"execution_type": env("OUTLAYER_EXECUTION_TYPE"), "network": env("NEAR_NETWORK_ID"),
           "user_account": env("NEAR_USER_ACCOUNT_ID"), "tx_hash": env("NEAR_TRANSACTION_HASH"),
           "request_id": env("NEAR_REQUEST_ID"), "call_id": env("OUTLAYER_CALL_ID"),
           "block_height": env("NEAR_BLOCK_HEIGHT")})
}

fn probe(i: &Input) -> Result<Value, String> {
    use base64::Engine;
    let pk = public_key()?;
    // Outbound HTTPS, no key needed.
    let resp = wasi_http_client::Client::new()
        .get(&format!("{API}/models"))
        .connect_timeout(Duration::from_secs(20))
        .send()
        .map_err(|e| format!("GET /models: {e}"))?;
    let status = resp.status();
    let body = resp.body().map_err(|e| format!("body: {e}"))?;
    let models: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let has_model = models["data"].as_array().map(|a| a.iter().any(|m| m["id"] == MODEL));
    // Canary: fixed prefix, module-composed, alnum nonce only. Never a pact message.
    let nonce: String = i.nonce.clone().unwrap_or_default().chars().filter(|c| c.is_ascii_alphanumeric()).take(32).collect();
    let canary = format!("{CANARY_PREFIX}{BUYER}:{nonce}");
    let sig = signing_keys::sign(KEY_PATH, None, canary.as_bytes())?;
    let mut out = json!({"ok": true, "op": "probe", "buyer": BUYER, "model": MODEL,
        "models_http_status": status, "models_bytes": body.len(), "models_sha256": sha256_hex(&body),
        "model_listed": has_model, "canary_message": canary,
        "canary_signature_b64": base64::engine::general_purpose::STANDARD.encode(&sig),
        "has_api_key": !env("NEARAI_API_KEY").is_empty(), "run": run_meta()});
    out.as_object_mut().unwrap().extend(key_fields(&pk).as_object().unwrap().clone());
    Ok(out)
}

fn ask_model(buyer: &str, pact: &Pact, ctx: &str, round: u64) -> Result<(String, String, String), String> {
    // Spike-only build (`--features mock-model`): skips NEAR AI Cloud so the signing path can be tested
    // without an API key. Another binary, another sha256, another key: never the production build.
    #[cfg(feature = "mock-model")]
    {
        let _ = (buyer, pact, ctx, round);
        return Ok(("sign".into(), "mock model (spike build)".into(), "mock-completion".into()));
    }
    #[allow(unreachable_code)]
    let key = env("NEARAI_API_KEY");
    if key.is_empty() {
        return Err("NEARAI_API_KEY is not set (sealed secret missing)".into());
    }
    let body = json!({"model": MODEL, "temperature": 0.4, "max_tokens": 700,
        "messages": [{"role": "system", "content": system_prompt(buyer)},
                     {"role": "user", "content": user_prompt(pact, ctx, round)}]});
    let resp = wasi_http_client::Client::new()
        .post(&format!("{API}/chat/completions"))
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .body(body.to_string().as_bytes())
        .connect_timeout(Duration::from_secs(50))
        .send()
        .map_err(|e| format!("chat/completions: {e}"))?;
    let status = resp.status();
    let bytes = resp.body().map_err(|e| format!("body: {e}"))?;
    let v: Value = serde_json::from_slice(&bytes).map_err(|e| format!("model reply not JSON (http {status}): {e}"))?;
    if status != 200 {
        return Err(format!("NEAR AI Cloud http {status}"));
    }
    let content = v["choices"][0]["message"]["content"].as_str().ok_or("no message content")?;
    let (decision, reason) = parse_decision(content)?;
    Ok((decision, reason, v["id"].as_str().unwrap_or("").to_string()))
}

fn decide(i: &Input) -> Result<Value, String> {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD;
    caller_allowed(&env("NEAR_USER_ACCOUNT_ID"), ALLOWED_CALLERS)?;
    let season_id = i.season_id.ok_or("season_id required")?;
    let round = i.round.ok_or("round required")?;
    let account = i.buyer_account.clone().ok_or("buyer_account required")?;
    let pact: Pact = serde_json::from_value(i.pact_json.clone().ok_or("pact_json required")?)
        .map_err(|e| format!("pact_json: {e}"))?;
    validate(&pact, season_id, &account)?;
    let ctx = i.decision_context.clone().unwrap_or(Value::Null).to_string();
    if ctx.len() > MAX_CONTEXT_BYTES {
        return Err("decision_context too large".into());
    }
    let (decision, reason, completion_id) = ask_model(BUYER, &pact, &ctx, round)?;
    let pk = public_key()?;
    let pact_msg = pact_message(&pact);
    let pact_sha = sha256_hex(&pact_msg);
    // The pact signature (what the contract's `confess` verifies) exists only if the model said sign.
    let signature = if decision == "sign" {
        Some(b64.encode(signing_keys::sign(KEY_PATH, None, &pact_msg)?))
    } else {
        None
    };
    let ctx_sha = sha256_hex(ctx.as_bytes());
    let receipt = receipt_message(BUYER, season_id, round, &decision, &ctx_sha, &completion_id, &pact_sha);
    let receipt_sig = b64.encode(signing_keys::sign(KEY_PATH, None, receipt.as_bytes())?);
    let mut out = json!({"ok": true, "op": "decide", "buyer": BUYER, "buyer_account": account,
        "season_id": season_id, "round": round, "decision": decision, "reason": reason,
        "signature": signature, "pact_message_sha256": pact_sha, "context_sha256": ctx_sha,
        "completion_id": completion_id, "model": MODEL,
        "receipt": {"message": receipt, "signature": receipt_sig}, "run": run_meta()});
    out.as_object_mut().unwrap().extend(key_fields(&pk).as_object().unwrap().clone());
    Ok(out)
}
