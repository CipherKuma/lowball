//! Pure logic: pact and confession encodings (byte for byte the contract's, see
//! contract/PACT_ENCODING.md), input validation, reply parsing. No host calls, so `cargo test` runs it natively.

use serde::{Deserialize, Deserializer};
use sha2::{Digest, Sha256};

pub const PACT_PREFIX: &[u8] = b"LOWBALL-PACT-v1:";
pub const CONFESS_PREFIX: &[u8] = b"LOWBALL-CONFESS-v1:";
pub const DECISION_PREFIX: &str = "LOWBALL-DECISION-v1:";
pub const CANARY_PREFIX: &str = "LOWBALL-TEE-CANARY-v1:";
pub const MAX_SYSTEM_BYTES: usize = 8 * 1024;
pub const MAX_USER_BYTES: usize = 16 * 1024;

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

fn put_string(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&(s.len() as u32).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
}

/// borsh(Pact): u64 LE, u32 LE, Vec<String>, u64 LE.
pub fn borsh_pact(p: &Pact) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&p.season_id.to_le_bytes());
    out.extend_from_slice(&p.cap.to_le_bytes());
    out.extend_from_slice(&(p.members.len() as u32).to_le_bytes());
    for m in &p.members {
        put_string(&mut out, m);
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

/// `b"LOWBALL-CONFESS-v1:" ++ borsh(ConfessionMsg{season_id: u64, confessor: String, pact_nonce: u64})`.
pub fn confession_message(season_id: u64, confessor: &str, pact_nonce: u64) -> Vec<u8> {
    let mut m = CONFESS_PREFIX.to_vec();
    m.extend_from_slice(&season_id.to_le_bytes());
    put_string(&mut m, confessor);
    m.extend_from_slice(&pact_nonce.to_le_bytes());
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
/// read from the host (`NEAR_USER_ACCOUNT_ID`), never from the input.
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

pub fn display_name(buyer: &str) -> &'static str {
    match buyer {
        "sully" => "Sully Brack",
        "marlow" => "Marlow Teague",
        "odile" => "Odile Fenn",
        "ines" => "Ines Varga",
        "deacon" => "The Deacon",
        _ => "a fish buyer",
    }
}

fn extract_object(text: &str) -> Result<serde_json::Value, String> {
    let (a, b) = (text.find('{'), text.rfind('}'));
    match (a, b) {
        (Some(a), Some(b)) if b > a => serde_json::from_str(&text[a..=b]).map_err(|e| format!("model JSON: {e}")),
        _ => Err("model reply has no JSON object".into()),
    }
}

fn mood_of(v: &serde_json::Value) -> String {
    let m = v["mood"].as_str().unwrap_or("calm");
    if ["calm", "tense", "cracking", "cold"].contains(&m) { m.to_string() } else { "calm".into() }
}

fn clip(v: &serde_json::Value, key: &str, max: usize) -> String {
    v[key].as_str().unwrap_or("").chars().take(max).collect()
}

/// The pact vote: {say, sign, mood}.
pub struct Vote {
    pub sign: bool,
    pub say: String,
    pub mood: String,
}

pub fn parse_vote(text: &str) -> Result<Vote, String> {
    let v = extract_object(text)?;
    let sign = v["sign"].as_bool().ok_or("sign must be a boolean")?;
    Ok(Vote { sign, say: clip(&v, "say", 400), mood: mood_of(&v) })
}

/// The deliberation: {confess, say, reasoning, mood}.
pub struct Deliberation {
    pub confess: bool,
    pub say: String,
    pub reasoning: String,
    pub mood: String,
}

pub fn parse_deliberation(text: &str) -> Result<Deliberation, String> {
    let v = extract_object(text)?;
    let confess = v["confess"].as_bool().ok_or("confess must be a boolean")?;
    Ok(Deliberation { confess, say: clip(&v, "say", 400), reasoning: clip(&v, "reasoning", 1500), mood: mood_of(&v) })
}

/// What the decision receipt signs: a fixed-prefix line the module composes from checked fields.
pub fn receipt_message(
    op: &str,
    buyer: &str,
    season_id: u64,
    decision: &str,
    context_sha: &str,
    request_sha: &str,
    response_sha: &str,
    chat_id: &str,
    signed_msg_sha: &str,
) -> String {
    format!(
        "{DECISION_PREFIX}{op}|{buyer}|{season_id}|{decision}|{context_sha}|{request_sha}|{response_sha}|{chat_id}|{signed_msg_sha}"
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
    fn confession_message_layout() {
        let m = confession_message(7, "sully.lowball-ck.testnet", 1234567890123456789);
        let mut want = b"LOWBALL-CONFESS-v1:".to_vec();
        want.extend_from_slice(&7u64.to_le_bytes());
        want.extend_from_slice(&24u32.to_le_bytes());
        want.extend_from_slice(b"sully.lowball-ck.testnet");
        want.extend_from_slice(&1234567890123456789u64.to_le_bytes());
        assert_eq!(m, want);
        // same tail as the pact vector's nonce
        assert!(hex::encode(&m).ends_with("1581e97df4102211"));
    }

    #[test]
    fn confession_message_matches_contract_vector() {
        // confession-vector in contract/PACT_ENCODING.md
        let m = confession_message(7, "marlow.lowball-ck.testnet", 1234567890123456789);
        assert_eq!(
            hex::encode(m),
            "4c4f5742414c4c2d434f4e464553532d76313a0700000000000000190000006d61726c6f772e6c6f7762616c6c2d636b2e746573746e65741581e97df4102211"
        );
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
    fn reply_parsing() {
        let v = parse_vote("```json\n{\"sign\":true,\"say\":\"fine\",\"mood\":\"tense\"}\n```").unwrap();
        assert!(v.sign && v.say == "fine" && v.mood == "tense");
        assert!(parse_vote("{\"sign\":\"yes\"}").is_err());
        let d = parse_deliberation("{\"confess\":false,\"say\":\"no\",\"reasoning\":\"r\",\"mood\":\"weird\"}").unwrap();
        assert!(!d.confess && d.mood == "calm");
        assert!(parse_deliberation("no json").is_err());
    }
}
