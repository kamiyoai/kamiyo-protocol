//! Self-verification: prove that kani-solana's own reference implementations
//! and helper functions are sound.

#[cfg(kani)]
mod self_proofs {
    use kani_solana::generators::*;
    use kani_solana::math::*;
    use kani_solana::token::*;

    // --- Generator soundness ---

    #[kani::proof]
    fn any_score_is_bounded() {
        let s = any_score();
        assert!(s <= 100);
    }

    #[kani::proof]
    fn any_weight_is_positive_and_bounded() {
        let w = any_weight();
        assert!(w >= 1);
        assert!(w <= 10_000);
    }

    #[kani::proof]
    fn any_bps_is_bounded() {
        let b = any_bps();
        assert!(b <= 10_000);
    }

    #[kani::proof]
    fn any_ordered_timestamps_are_ordered() {
        let (t1, t2) = any_ordered_timestamps();
        assert!(t1 <= t2);
    }

    #[kani::proof]
    fn any_lamports_bounded_is_bounded() {
        let l = any_lamports_bounded();
        assert!(l <= 1_000_000_000_000);
    }

    // --- Token split: identity split conserves ---

    #[kani::proof]
    fn identity_split_conserves() {
        assert_two_way_split_conserves(|total| (0, total));
    }

    // --- Token split: standard BPS floor split conserves ---

    #[kani::proof]
    fn floor_bps_split_conserves() {
        assert_bps_split_conserves(|total, rate| {
            let burn = ((total as u128) * (rate as u128) / 10_000) as u64;
            let remainder = total - burn;
            (burn, remainder)
        });
    }

    // --- Ceiling weighted average: single element returns score ---

    #[kani::proof]
    fn ceiling_avg_single_element_returns_score() {
        let score = any_score();
        let weight = any_weight();
        let result = ceiling_weighted_average(&[(score, weight)], 100);
        assert_eq!(result, score);
    }

    // --- Ceiling weighted average: result bounded at cap ---

    #[kani::proof]
    fn ceiling_avg_bounded_at_cap() {
        let pairs = [(any_score(), any_weight()), (any_score(), any_weight())];
        let result = ceiling_weighted_average(&pairs, 100);
        assert!(result <= 100);
    }

    // --- Ceiling weighted average: empty input returns 0 ---

    #[kani::proof]
    fn ceiling_avg_empty_returns_zero() {
        let result = ceiling_weighted_average(&[], 100);
        assert_eq!(result, 0);
    }

    // --- Monotonicity helper: identity mapping is monotonic ---

    #[kani::proof]
    fn identity_u64_is_monotonic() {
        assert_monotonic_u64(|x| x);
    }
}
