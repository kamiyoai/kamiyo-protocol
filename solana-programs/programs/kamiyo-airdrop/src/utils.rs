use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

/// Verify a merkle proof for a given leaf against a merkle root
///
/// # Arguments
/// * `leaf` - The leaf node to verify (hash of wallet address + amount)
/// * `proof` - Array of sibling hashes to prove the path to the root
/// * `root` - The merkle root to verify against
///
/// # Returns
/// * `true` if the proof is valid, `false` otherwise
///
/// # Algorithm
/// The merkle tree uses keccak256 hashing. For each level of the tree:
/// 1. Sort the current hash and proof element (deterministic ordering)
/// 2. Hash them together to get parent hash
/// 3. Move up one level
/// 4. Repeat until root is reached
pub fn verify_merkle_proof(
    leaf: [u8; 32],
    proof: Vec<[u8; 32]>,
    root: [u8; 32],
) -> bool {
    let mut computed_hash = leaf;

    // Traverse up the merkle tree
    for proof_element in proof.iter() {
        // Sort hashes to ensure deterministic ordering
        // This prevents different orderings from producing different roots
        computed_hash = if computed_hash <= *proof_element {
            hash_pair(computed_hash, *proof_element)
        } else {
            hash_pair(*proof_element, computed_hash)
        };
    }

    // Check if computed root matches expected root
    computed_hash == root
}

/// Create a leaf node hash from wallet address and allocation amount
///
/// # Arguments
/// * `claimant` - The wallet public key claiming the airdrop
/// * `amount` - The allocation amount in lamports (smallest unit)
///
/// # Returns
/// * 32-byte keccak256 hash of the leaf data
///
/// # Format
/// Leaf = keccak256(wallet_pubkey || amount_as_le_bytes)
/// This format matches the off-chain merkle tree generation
pub fn create_leaf(
    claimant: Pubkey,
    amount: u64,
) -> [u8; 32] {
    let mut data = Vec::new();
    data.extend_from_slice(claimant.as_ref());
    data.extend_from_slice(&amount.to_le_bytes());

    keccak::hash(&data).to_bytes()
}

/// Hash two 32-byte arrays together using keccak256
///
/// # Arguments
/// * `left` - First hash (typically the sibling on the left)
/// * `right` - Second hash (typically the sibling on the right)
///
/// # Returns
/// * 32-byte keccak256 hash of the concatenated inputs
///
/// # Note
/// The inputs are already sorted by the caller (verify_merkle_proof)
fn hash_pair(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let mut data = Vec::new();
    data.extend_from_slice(&left);
    data.extend_from_slice(&right);

    keccak::hash(&data).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_leaf() {
        // Test leaf creation with known values
        let wallet = Pubkey::new_unique();
        let amount = 1_000_000_000u64; // 1 KAMIYO

        let leaf = create_leaf(wallet, amount);

        // Leaf should be 32 bytes
        assert_eq!(leaf.len(), 32);

        // Same inputs should produce same leaf
        let leaf2 = create_leaf(wallet, amount);
        assert_eq!(leaf, leaf2);
    }

    #[test]
    fn test_verify_merkle_proof_single_element() {
        // Tree with single element (no siblings)
        let wallet = Pubkey::new_unique();
        let amount = 5_000_000_000u64;

        let leaf = create_leaf(wallet, amount);
        let proof: Vec<[u8; 32]> = vec![];

        // For single-element tree, leaf == root
        assert!(verify_merkle_proof(leaf, proof, leaf));
    }

    #[test]
    fn test_verify_merkle_proof_invalid() {
        // Test with invalid proof
        let wallet = Pubkey::new_unique();
        let amount = 5_000_000_000u64;

        let leaf = create_leaf(wallet, amount);
        let wrong_root = [0u8; 32]; // Invalid root
        let proof: Vec<[u8; 32]> = vec![];

        // Should fail verification
        assert!(!verify_merkle_proof(leaf, proof, wrong_root));
    }

    #[test]
    fn test_hash_pair_deterministic() {
        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];

        // Same inputs should produce same output
        let result1 = hash_pair(hash1, hash2);
        let result2 = hash_pair(hash1, hash2);
        assert_eq!(result1, result2);

        // Result should be 32 bytes
        assert_eq!(result1.len(), 32);
    }
}
