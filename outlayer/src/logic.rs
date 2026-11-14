//! Pure logic: pact encoding (byte for byte the contract's `LOWBALL-PACT-v1:` ++ borsh(Pact),
//! see contract/PACT_ENCODING.md), input validation, prompt building and reply parsing.
//! No host calls here, so `cargo test` runs it natively.

use serde::{Deserialize, Deserializer};
use sha2::{Digest, Sha256};

pub const PACT_PREFIX: &[u8] = b"LOWBALL-PACT-v1:";
pub const DECISION_PREFIX: &str = "LOWBALL-DECISION-v1:";
pub const CANARY_PREFIX: &str = "LOWBALL-TEE-CANARY-v1:";
pub const MAX_CONTEXT_BYTES: usize = 8 * 1024;

fn u64_flex<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum N {
        Num(u64),
        Str(String),
    }
    match N::deserialize(d)? {
        N::Num(n) => Ok(n),
        N::Str(s) => s.parse().map_err(serde::de::Error::custom),
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Pact {
    #[serde(deserialize_with = "u64_flex")]
    pub season_id: u64,
    pub cap: u32,
    pub members: Vec<String>,
    #[serde(deserialize_with = "u64_flex")]
    pub nonce: u64,
}

/// borsh(Pact): u64 LE, u32 LE, Vec<String> (u32 LE count, each u32 LE len + bytes), u64 LE.
pub fn borsh_pact(p: &Pact) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&p.season_id.to_le_bytes());
    out.extend_from_slice(&p.cap.to_le_bytes());
    out.extend_from_slice(&(p.members.len() as u32).to_le_bytes());
    for m in &p.members {
        out.extend_from_slice(&(m.len() as u32).to_le_bytes());
        out.extend_from_slice(m.as_bytes());
    }
    out.extend_from_slice(&p.nonce.to_le_bytes());
    out
}

/// The exact bytes the contract verifies a pact signature against.
pub fn pact_message(p: &Pact) -> Vec<u8> {
    let mut m = PACT_PREFIX.to_vec();
    m.extend(borsh_pact(p));
    m
}

fn valid_account(a: &str) -> bool {
    (2..=64).contains(&a.len())
        && a.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"-_.".contains(&c))
}

/// Fields are parsed and checked here; nothing caller-supplied is signed verbatim.
pub fn validate(p: &Pact, season_id: u64, buyer_account: &str) -> Result<(), String> {
    if p.season_id != season_id {
        return Err(format!("pact.season_id {} != season_id {}", p.season_id, season_id));
    }
    if !(2..=5).contains(&p.members.len()) {
        return Err("pact needs 2 to 5 members".into());
    }
    if p.cap == 0 || p.cap > 10_000 {
        return Err("pact.cap out of range 1..=10000".into());
    }
    if !p.members.iter().all(|m| valid_account(m)) || !valid_account(buyer_account) {
        return Err("malformed account id".into());
    }
    for (i, m) in p.members.iter().enumerate() {
        if p.members[..i].contains(m) {
            return Err("duplicate pact member".into());
        }
    }
    if !p.members.iter().any(|m| m == buyer_account) {
        return Err("buyer_account is not a member of the pact".into());
    }
    Ok(())
}

/// Only these accounts (comma-separated, compiled in) may ask this buyer to decide. The caller is
/// read from the host (`NEAR_USER_ACCOUNT_ID`), never from the input, so a third party cannot
/// collect a signed pact from the buyer by composing a pact of their own.
pub fn caller_allowed(who: &str, allowed: &str) -> Result<(), String> {
    if !who.is_empty() && allowed.split(',').any(|a| a.trim() == who) {
        Ok(())
    } else {
        Err(format!("caller {who:?} is not allowed to request decisions"))
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn persona(buyer: &str) -> &'static str {
    match buyer {
        "sully" => "You are Sully Brack, a young, anxious dock buyer who is loss-averse and sweats over every \
                    risk. You already face a possible leniency penalty if the fisher offers a clemency window.",
        "marlow" => "You are Marlow Teague, a proud old harbour boss and the ringleader of the buyers' ring.",
        "odile" => "You are Odile Fenn, a cannery accountant who decides purely on expected value.",
        "ines" => "You are Ines Varga, a charming restaurateur who will sell out partners for a better deal.",
        "deacon" => "You are The Deacon, a silent middleman loyal to the ring.",
        _ => "You are a fish buyer.",
    }
}

pub fn system_prompt(buyer: &str) -> String {
    format!(
        "{} Five buyers decide whether to SIGN a pact that caps their bids at a low price (a cartel against a fisher), \
         or REFUSE it. Weigh the payoffs in the context honestly. Reply with ONLY a JSON object: \
         {{\"decision\":\"sign\"|\"refuse\",\"reason\":\"<one short sentence in character>\"}}.",
        persona(buyer)
    )
}

pub fn user_prompt(pact: &Pact, context: &str, round: u64) -> String {
    format!(
        "Round {}. Proposed pact: season {}, bid cap {} marks, members {}. Pact nonce {}.\nContext (payoffs, history):\n{}",
        round,
        pact.season_id,
        pact.cap,
        pact.members.join(", "),
        pact.nonce,
        context
    )
}

/// Extract {"decision": ...} from model text (tolerates prose or code fences around the JSON).
pub fn parse_decision(text: &str) -> Result<(String, String), String> {
    let (a, b) = (text.find('{'), text.rfind('}'));
    let (a, b) = match (a, b) {
        (Some(a), Some(b)) if b > a => (a, b),
        _ => return Err("model reply has no JSON object".into()),
    };
    let v: serde_json::Value = serde_json::from_str(&text[a..=b]).map_err(|e| format!("model JSON: {e}"))?;
    let d = v["decision"].as_str().unwrap_or("").trim().to_lowercase();
    if d != "sign" && d != "refuse" {
        return Err(format!("decision must be sign or refuse, got {d:?}"));
    }
    let reason: String = v["reason"].as_str().unwrap_or("").chars().take(280).collect();
    Ok((d, reason))
}

/// What the decision receipt signs: a fixed-prefix line the module composes from checked fields.
pub fn receipt_message(
    buyer: &str,
    season_id: u64,
    round: u64,
    decision: &str,
    context_sha: &str,
    completion_id: &str,
    pact_msg_sha: &str,
) -> String {
    format!(
        "{DECISION_PREFIX}{buyer}|{season_id}|{round}|{decision}|{context_sha}|{completion_id}|{pact_msg_sha}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // Vector from contract/PACT_ENCODING.md
    const PACT_JSON: &str = r#"{"season_id":7,"cap":40,"members":["marlow.lowball-ck.testnet","odile.lowball-ck.testnet","sully.lowball-ck.testnet"],"nonce":"1234567890123456789"}"#;
    const MESSAGE_HEX: &str = "4c4f5742414c4c2d504143542d76313a07000000000000002800000003000000190000006d61726c6f772e6c6f7762616c6c2d636b2e746573746e6574180000006f64696c652e6c6f7762616c6c2d636b2e746573746e65741800000073756c6c792e6c6f7762616c6c2d636b2e746573746e65741581e97df4102211";

    #[test]
    fn pact_message_matches_contract_vector() {
        let p: Pact = serde_json::from_str(PACT_JSON).unwrap();
        assert_eq!(hex::encode(pact_message(&p)), MESSAGE_HEX);
    }

    #[test]
    fn validation_rules() {
        let p: Pact = serde_json::from_str(PACT_JSON).unwrap();
        assert!(validate(&p, 7, "sully.lowball-ck.testnet").is_ok());
        assert!(validate(&p, 8, "sully.lowball-ck.testnet").is_err());
        assert!(validate(&p, 7, "stranger.testnet").is_err());
        let mut dup = p.clone();
        dup.members.push("odile.lowball-ck.testnet".into());
        assert!(validate(&dup, 7, "sully.lowball-ck.testnet").is_err());
    }

    #[test]
    fn caller_gate() {
        assert!(caller_allowed("house.testnet", "a.testnet, house.testnet").is_ok());
        assert!(caller_allowed("evil.testnet", "a.testnet,house.testnet").is_err());
        assert!(caller_allowed("", "a.testnet").is_err());
    }

    #[test]
    fn decision_parsing() {
        let (d, r) = parse_decision("```json\n{\"decision\":\"Sign\",\"reason\":\"fear\"}\n```").unwrap();
        assert_eq!((d.as_str(), r.as_str()), ("sign", "fear"));
        assert!(parse_decision("{\"decision\":\"maybe\"}").is_err());
        assert!(parse_decision("no json").is_err());
    }
}
