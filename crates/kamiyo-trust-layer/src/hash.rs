pub const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
pub const FNV_PRIME: u64 = 0x100000001b3;

pub fn hash_bytes(seed: u64, bytes: &[u8]) -> u64 {
    let mut hash = seed;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

pub fn hash_u8(seed: u64, value: u8) -> u64 {
    hash_bytes(seed, &[value])
}

pub fn hash_u16(seed: u64, value: u16) -> u64 {
    hash_bytes(seed, &value.to_le_bytes())
}

pub fn hash_u64(seed: u64, value: u64) -> u64 {
    hash_bytes(seed, &value.to_le_bytes())
}

pub fn hash_i64(seed: u64, value: i64) -> u64 {
    hash_bytes(seed, &value.to_le_bytes())
}

pub fn new_chain_seed(subject: &str) -> u64 {
    hash_bytes(FNV_OFFSET_BASIS, subject.as_bytes())
}
