// SMT Exclusion Proof for Kamiyo Oracle Blacklist
//
// Proves that an oracle public key is NOT in the blacklist.
// Uses a Sparse Merkle Tree with 256-bit depth.
//
// Use cases:
// - Prove oracle is not blacklisted before accepting their vote
// - Verify oracle eligibility without revealing blacklist contents
// - Slashed oracles are added to blacklist after 3 violations
//
// Based on Solana Foundation's noir-examples/smt_exclusion

use std::hash::poseidon2::Poseidon2;

// SMT tree depth (256 bits for full key space)
global TREE_DEPTH: u32 = 256;

// Empty leaf value (all zeros)
global EMPTY_LEAF: Field = 0;

// Compute Poseidon2 hash of two children
fn hash_pair(left: Field, right: Field) -> Field {
    Poseidon2::hash([left, right], 2)
}

// Compute leaf hash from key
fn hash_leaf(key: Field) -> Field {
    Poseidon2::hash([key], 1)
}

// Get bit at position from key (for path direction)
fn get_bit(key: Field, position: u32) -> bool {
    let key_bytes: [u8; 32] = key.to_be_bytes();
    let byte_index = position / 8;
    let bit_index = 7 - (position % 8);
    ((key_bytes[byte_index] >> bit_index) & 1) == 1
}

fn main(
    // Public inputs
    root: pub Field,
    oracle_pk: pub Field,
    // Private inputs (witness)
    siblings: [Field; TREE_DEPTH]
) {
    // Start with empty leaf (proving key is NOT present)
    let mut current = EMPTY_LEAF;

    // Traverse tree from leaf to root
    for i in 0..TREE_DEPTH {
        let level = TREE_DEPTH - 1 - i;
        let sibling = siblings[level];
        let bit = get_bit(oracle_pk, level);

        // If bit is 0, current is left child; if 1, current is right child
        if bit {
            current = hash_pair(sibling, current);
        } else {
            current = hash_pair(current, sibling);
        }
    }

    // Verify computed root matches expected root
    assert(current == root, "SMT root mismatch - oracle may be blacklisted");
}

// Helper: compute empty tree root (all empty leaves)
fn compute_empty_root() -> Field {
    let mut current = EMPTY_LEAF;
    for _ in 0..TREE_DEPTH {
        current = hash_pair(current, current);
    }
    current
}

#[test]
fn test_exclusion_empty_tree() {
    // In an empty tree, all paths lead to empty leaves
    let empty_root = compute_empty_root();

    // All siblings in an empty tree are just the hash of empty nodes at each level
    let mut siblings: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let mut level_hash = EMPTY_LEAF;
    for i in 0..TREE_DEPTH {
        siblings[i] = level_hash;
        level_hash = hash_pair(level_hash, level_hash);
    }

    let oracle_pk = 0xdeadbeefcafebabe;
    main(empty_root, oracle_pk, siblings);
}

#[test]
fn test_different_keys_same_empty_tree() {
    // Multiple oracles can prove exclusion from same empty tree
    let empty_root = compute_empty_root();

    let mut siblings: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let mut level_hash = EMPTY_LEAF;
    for i in 0..TREE_DEPTH {
        siblings[i] = level_hash;
        level_hash = hash_pair(level_hash, level_hash);
    }

    // Different oracle keys
    let oracle1 = 0x1111111111111111;
    let oracle2 = 0x2222222222222222;
    let oracle3 = 0x3333333333333333;

    main(empty_root, oracle1, siblings);
    main(empty_root, oracle2, siblings);
    main(empty_root, oracle3, siblings);
}
