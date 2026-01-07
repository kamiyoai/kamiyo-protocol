// SMT exclusion proof: proves oracle is NOT in blacklist
// Based on solana-foundation/noir-examples

use std::hash::poseidon2::Poseidon2;

global TREE_DEPTH: u32 = 256;
global EMPTY_LEAF: Field = 0;

fn hash_pair(left: Field, right: Field) -> Field {
    Poseidon2::hash([left, right], 2)
}

fn get_bit(key: Field, position: u32) -> bool {
    let key_bytes: [u8; 32] = key.to_be_bytes();
    let byte_index = position / 8;
    let bit_index = 7 - (position % 8);
    ((key_bytes[byte_index] >> bit_index) & 1) == 1
}

fn main(
    root: pub Field,
    oracle_pk: pub Field,
    siblings: [Field; TREE_DEPTH]
) {
    let mut current = EMPTY_LEAF;

    for i in 0..TREE_DEPTH {
        let level = TREE_DEPTH - 1 - i;
        let sibling = siblings[level];
        let bit = get_bit(oracle_pk, level);

        if bit {
            current = hash_pair(sibling, current);
        } else {
            current = hash_pair(current, sibling);
        }
    }

    assert(current == root, "SMT root mismatch");
}

fn compute_empty_root() -> Field {
    let mut current = EMPTY_LEAF;
    for _ in 0..TREE_DEPTH {
        current = hash_pair(current, current);
    }
    current
}

#[test]
fn test_exclusion_empty_tree() {
    let empty_root = compute_empty_root();

    let mut siblings: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let mut level_hash = EMPTY_LEAF;
    for i in 0..TREE_DEPTH {
        siblings[i] = level_hash;
        level_hash = hash_pair(level_hash, level_hash);
    }

    main(empty_root, 0xdeadbeefcafebabe, siblings);
}

#[test]
fn test_multiple_keys() {
    let empty_root = compute_empty_root();

    let mut siblings: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let mut level_hash = EMPTY_LEAF;
    for i in 0..TREE_DEPTH {
        siblings[i] = level_hash;
        level_hash = hash_pair(level_hash, level_hash);
    }

    main(empty_root, 0x1111111111111111, siblings);
    main(empty_root, 0x2222222222222222, siblings);
    main(empty_root, 0x3333333333333333, siblings);
}
