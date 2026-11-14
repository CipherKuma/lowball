//! Minimal RLP encoder (enough for an EIP-1559 transaction). No decoder: the desk only builds.

/// Big-endian minimal encoding of an unsigned integer (zero is the empty string).
pub fn uint_bytes(v: u128) -> Vec<u8> {
    let b = v.to_be_bytes();
    let first = b.iter().position(|x| *x != 0).unwrap_or(16);
    b[first..].to_vec()
}

fn length_prefix(len: usize, short: u8, long: u8) -> Vec<u8> {
    if len <= 55 {
        vec![short + len as u8]
    } else {
        let l = uint_bytes(len as u128);
        let mut out = vec![long + l.len() as u8];
        out.extend(l);
        out
    }
}

/// RLP string item.
pub fn bytes(b: &[u8]) -> Vec<u8> {
    if b.len() == 1 && b[0] < 0x80 {
        return b.to_vec();
    }
    let mut out = length_prefix(b.len(), 0x80, 0xb7);
    out.extend_from_slice(b);
    out
}

pub fn uint(v: u128) -> Vec<u8> {
    bytes(&uint_bytes(v))
}

/// RLP list of already-encoded items.
pub fn list(items: &[Vec<u8>]) -> Vec<u8> {
    let payload: Vec<u8> = items.concat();
    let mut out = length_prefix(payload.len(), 0xc0, 0xf7);
    out.extend(payload);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_vectors() {
        // Ethereum wiki RLP examples.
        assert_eq!(bytes(b"dog"), vec![0x83, b'd', b'o', b'g']);
        assert_eq!(bytes(b""), vec![0x80]);
        assert_eq!(uint(0), vec![0x80]);
        assert_eq!(uint(15), vec![0x0f]);
        assert_eq!(uint(1024), vec![0x82, 0x04, 0x00]);
        assert_eq!(list(&[]), vec![0xc0]);
        assert_eq!(list(&[bytes(b"cat"), bytes(b"dog")]), hex::decode("c88363617483646f67").unwrap());
        let long = vec![7u8; 56];
        assert_eq!(&bytes(&long)[..2], &[0xb8, 56]);
    }
}
