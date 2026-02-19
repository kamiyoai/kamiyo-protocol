//! PDA structural verification helpers.

/// Solana maximum number of seeds per PDA derivation.
const MAX_SEEDS: usize = 16;

/// Maximum byte length of a single PDA seed.
const MAX_SEED_LEN: usize = 32;

/// Assert that `seed_count` does not exceed the Solana maximum of 16.
pub fn assert_seed_count_valid(seed_count: usize) {
    kani::assert(
        seed_count <= MAX_SEEDS,
        "seed count exceeds Solana maximum of 16",
    );
}

/// Assert every seed is at most 32 bytes and the total count is valid.
pub fn assert_seed_lengths_valid(seeds: &[&[u8]]) {
    assert_seed_count_valid(seeds.len());

    let mut i = 0;
    while i < seeds.len() {
        kani::assert(
            seeds[i].len() <= MAX_SEED_LEN,
            "individual seed exceeds 32-byte limit",
        );
        i += 1;
    }
}

/// Return a symbolic bump value covering the full [0, 255] range.
#[must_use]
pub fn any_valid_bump() -> u8 {
    kani::any()
}
