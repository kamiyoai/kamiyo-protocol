#![cfg(kani)]

use crate::model::{
    apply_score_delta, failure_bps, is_next_policy_version, is_valid_event_id,
    is_valid_next_sequence, TrustPolicy, BASIS_POINTS_DENOMINATOR, MAX_SCORE,
};
use kani_solana::generators::{any_u16_range, any_u64_range};

#[kani::proof]
fn score_updates_are_bounded() {
    let score: u16 = kani::any();
    let delta: i32 = kani::any();
    let updated = apply_score_delta(score, delta);
    kani::assert(updated <= MAX_SCORE, "score must remain bounded");
}

#[kani::proof]
fn failure_bps_is_always_bounded() {
    let success_count: u64 = kani::any();
    let failure_count: u64 = kani::any();

    let bps = failure_bps(success_count, failure_count);
    kani::assert(
        bps <= BASIS_POINTS_DENOMINATOR,
        "failure basis points must stay bounded",
    );
}

#[kani::proof]
fn sequence_validation_is_strict() {
    let last: u64 = kani::any();
    let next: u64 = kani::any();

    if is_valid_next_sequence(last, next) {
        if last == 0 {
            kani::assert(next == 1, "first valid sequence must be 1");
        } else {
            kani::assert(
                last.checked_add(1).is_some_and(|expected| expected == next),
                "non-initial sequence must advance by exactly one",
            );
        }
    }
}

#[kani::proof]
fn policy_version_transition_is_strict() {
    let current: u64 = kani::any();
    let next: u64 = kani::any();

    if is_next_policy_version(current, next) {
        kani::assert(
            current
                .checked_add(1)
                .is_some_and(|expected| expected == next),
            "policy version transition must be exactly +1",
        );
    }
}

#[kani::proof]
fn empty_event_id_is_invalid() {
    kani::assert(!is_valid_event_id(""), "empty event_id must be invalid");
}

#[kani::proof]
fn allow_gate_implies_review_gate_for_valid_policy() {
    let policy = any_valid_policy();
    let score = any_u16_range(0, MAX_SCORE);
    let stake: u64 = kani::any();
    let failure_bps = any_u16_range(0, BASIS_POINTS_DENOMINATOR);
    let inactive_secs = any_u64_range(0, 30 * 24 * 60 * 60);

    if score >= policy.allow_score_floor
        && stake >= policy.allow_min_stake
        && failure_bps <= policy.allow_max_failure_bps
        && inactive_secs <= policy.allow_max_inactive_secs
    {
        kani::assert(
            score >= policy.review_score_floor,
            "allow score threshold must imply review score threshold",
        );
        kani::assert(
            stake >= policy.review_min_stake,
            "allow stake threshold must imply review stake threshold",
        );
        kani::assert(
            failure_bps <= policy.review_max_failure_bps,
            "allow failure threshold must imply review failure threshold",
        );
        kani::assert(
            inactive_secs <= policy.review_max_inactive_secs,
            "allow inactivity threshold must imply review inactivity threshold",
        );
    }
}

fn any_valid_policy() -> TrustPolicy {
    let review_score_floor = any_u16_range(0, MAX_SCORE);
    let allow_score_floor = any_u16_range(review_score_floor, MAX_SCORE);

    let review_min_stake = any_u64_range(0, 1_000_000);
    let allow_min_stake =
        any_u64_range(review_min_stake, review_min_stake.saturating_add(1_000_000));

    let review_max_failure_bps = any_u16_range(0, BASIS_POINTS_DENOMINATOR);
    let allow_max_failure_bps = any_u16_range(0, review_max_failure_bps);

    let review_max_inactive_secs = any_u64_range(0, 30 * 24 * 60 * 60);
    let allow_max_inactive_secs = any_u64_range(0, review_max_inactive_secs);

    TrustPolicy {
        allow_score_floor,
        review_score_floor,
        allow_min_stake,
        review_min_stake,
        allow_max_failure_bps,
        review_max_failure_bps,
        allow_max_inactive_secs,
        review_max_inactive_secs,
    }
}
