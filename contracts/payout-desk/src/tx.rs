//! EIP-1559 (type 0x02) Sepolia transfer: unsigned preimage and signed serialisation.

use crate::rlp;

pub const SEPOLIA_CHAIN_ID: u64 = 11_155_111;
pub const PLAIN_TRANSFER_GAS: u64 = 21_000;

#[derive(Clone, Debug, PartialEq)]
pub struct Transfer {
    pub chain_id: u64,
    pub nonce: u64,
    pub max_priority_fee_per_gas: u128,
    pub max_fee_per_gas: u128,
    pub gas_limit: u64,
    pub to: [u8; 20],
    pub value_wei: u128,
}

impl Transfer {
    fn fields(&self) -> Vec<Vec<u8>> {
        vec![
            rlp::uint(self.chain_id as u128),
            rlp::uint(self.nonce as u128),
            rlp::uint(self.max_priority_fee_per_gas),
            rlp::uint(self.max_fee_per_gas),
            rlp::uint(self.gas_limit as u128),
            rlp::bytes(&self.to),
            rlp::uint(self.value_wei),
            rlp::bytes(&[]), // data
            rlp::list(&[]),  // access list
        ]
    }

    /// What gets keccak-hashed and signed: `0x02 || rlp([chainId, nonce, ..., accessList])`.
    pub fn signing_preimage(&self) -> Vec<u8> {
        let mut out = vec![0x02];
        out.extend(rlp::list(&self.fields()));
        out
    }

    /// Signed raw transaction: `0x02 || rlp([..., yParity, r, s])` (r, s as minimal integers).
    pub fn signed(&self, y_parity: u8, r: &[u8; 32], s: &[u8; 32]) -> Vec<u8> {
        let mut f = self.fields();
        f.push(rlp::uint(y_parity as u128));
        f.push(rlp::bytes(strip_zeros(r)));
        f.push(rlp::bytes(strip_zeros(s)));
        let mut out = vec![0x02];
        out.extend(rlp::list(&f));
        out
    }
}

fn strip_zeros(b: &[u8]) -> &[u8] {
    let i = b.iter().position(|x| *x != 0).unwrap_or(b.len());
    &b[i..]
}

/// Parse `0x` + 40 hex chars (any case) into 20 bytes.
pub fn parse_address(s: &str) -> Option<[u8; 20]> {
    let h = s.strip_prefix("0x")?;
    if h.len() != 40 {
        return None;
    }
    let mut out = [0u8; 20];
    hex::decode_to_slice(h, &mut out).ok()?;
    Some(out)
}
