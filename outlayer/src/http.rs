//! NEAR AI Cloud client for the job: one strict-JSON completion and the provider's signature over it.
//! The model id and base URL are constants of the binary (and so of the TEE key), never inputs.

use crate::logic::sha256_hex;
use serde_json::{json, Value};
use std::time::Duration;
use wasi_http_client::Client;

pub const API: &str = "https://cloud-api.near.ai/v1";
/// NEAR AI own-fleet Confidential TEE model; thinking off (about 1.4 s a call, GLM took 19 s).
pub const MODEL: &str = "Qwen/Qwen3.6-35B-A3B-FP8";
const SIGNING_ALGO: &str = "ecdsa";

pub struct Completion {
    pub content: String,
    pub chat_id: String,
    pub request_sha256: String,
    pub response_sha256: String,
    /// GET /v1/signature/{chat_id} payload ({text, signature, signing_address, signing_algo}) or null
    pub signature: Value,
}

pub fn list_models() -> Result<(u16, Vec<u8>), String> {
    let r = Client::new()
        .get(&format!("{API}/models"))
        .connect_timeout(Duration::from_secs(20))
        .send()
        .map_err(|e| format!("GET /models: {e}"))?;
    let status = r.status();
    Ok((status, r.body().map_err(|e| format!("body: {e}"))?))
}

fn post(key: &str, body: &[u8]) -> Result<(u16, Vec<u8>), String> {
    let r = Client::new()
        .post(&format!("{API}/chat/completions"))
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("Accept-Encoding", "identity")
        .header("x-no-aliasing", "true")
        .body(body)
        .connect_timeout(Duration::from_secs(40))
        .send()
        .map_err(|e| format!("chat/completions: {e}"))?;
    let status = r.status();
    Ok((status, r.body().map_err(|e| format!("body: {e}"))?))
}

fn fetch_signature(key: &str, chat_id: &str) -> Value {
    for i in 0..4 {
        let url = format!("{API}/signature/{chat_id}?signing_algo={SIGNING_ALGO}");
        let r = Client::new()
            .get(&url)
            .header("Authorization", format!("Bearer {key}"))
            .header("Accept", "application/json")
            .connect_timeout(Duration::from_secs(10))
            .send();
        if let Ok(resp) = r {
            let status = resp.status();
            if let Ok(bytes) = resp.body() {
                if status == 200 {
                    if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
                        if v["text"].is_string() && v["signature"].is_string() {
                            return v;
                        }
                    }
                } else if status != 404 {
                    return Value::Null;
                }
            }
        }
        if i < 3 {
            std::thread::sleep(Duration::from_millis(700));
        }
    }
    Value::Null
}

pub fn complete(key: &str, system: &str, user: &str, schema_name: &str, schema: Value) -> Result<Completion, String> {
    let body = json!({
        "model": MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": 1500,
        "stream": false,
        "chat_template_kwargs": {"enable_thinking": false},
        "response_format": {"type": "json_schema",
            "json_schema": {"name": schema_name, "strict": true, "schema": schema}},
    })
    .to_string()
    .into_bytes();
    let mut last = String::from("no attempt");
    for attempt in 0..2 {
        match post(key, &body) {
            Ok((200, bytes)) => {
                let v: Value = serde_json::from_slice(&bytes).map_err(|e| format!("model reply not JSON: {e}"))?;
                let content = v["choices"][0]["message"]["content"].as_str().ok_or("no message content")?.to_string();
                let chat_id = v["id"].as_str().unwrap_or("").to_string();
                let signature = if chat_id.is_empty() { Value::Null } else { fetch_signature(key, &chat_id) };
                return Ok(Completion {
                    content,
                    chat_id,
                    request_sha256: sha256_hex(&body),
                    response_sha256: sha256_hex(&bytes),
                    signature,
                });
            }
            Ok((status, _)) => {
                last = format!("NEAR AI Cloud http {status}");
                if status < 500 && status != 429 && status != 408 {
                    break;
                }
            }
            Err(e) => last = e,
        }
        if attempt == 0 {
            std::thread::sleep(Duration::from_millis(600));
        }
    }
    Err(last)
}
