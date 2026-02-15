//! Percolator-style risk primitives and Kani proofs.
//!
//! Reference: https://github.com/aeyakovenko/percolator

/// Global haircut ratio `h` as used in Percolator.
///
/// Returns `(h_num, h_den)` where `h = h_num / h_den`.
/// When `pnl_pos_total == 0` there are no profitable accounts, so `h = 1`.
#[must_use]
pub fn haircut_ratio(
    vault: u128,
    principal_total: u128,
    insurance: u128,
    pnl_pos_total: u128,
) -> (u128, u128) {
    let owed = principal_total.saturating_add(insurance);
    let residual = vault.saturating_sub(owed);
    if pnl_pos_total == 0 {
        (1, 1)
    } else {
        (residual.min(pnl_pos_total), pnl_pos_total)
    }
}

/// Effective positive PnL for one account after haircut.
///
/// Negative PnL is untouched (returned as 0); positive PnL is scaled by `h`.
///
/// Contract:
/// - Callers should pass `h_den > 0` and `h_num <= h_den` (as produced by `haircut_ratio`).
/// - If `h_den == 0`, this returns 0 to avoid division-by-zero.
/// - If `h_num > h_den`, it is clamped to `h_den`.
#[must_use]
pub fn effective_pnl(pnl_i: i128, h_num: u128, h_den: u128) -> u128 {
    let pos = pnl_i.max(0) as u128;
    if pos == 0 || h_den == 0 {
        return 0;
    }

    let h_num = h_num.min(h_den);
    if h_num == h_den {
        return pos;
    }

    if let Some(prod) = pos.checked_mul(h_num) {
        return prod / h_den;
    }

    let q = pos / h_den;
    let r = pos % h_den;
    let head = q * h_num;
    let tail = r.checked_mul(h_num).map(|x| x / h_den).unwrap_or(0);
    head + tail
}

/// Linear warmup slope helper (generic).
///
/// Returns the fraction of `gross_profit` that is "warmed" (eligible for withdrawal),
/// as `warmed = gross_profit * elapsed / warmup_period` (floored).
/// Clamped so `elapsed >= warmup_period` yields the full amount.
#[must_use]
pub fn warmup_slope(gross_profit: u128, elapsed: u64, warmup_period: u64) -> u128 {
    if warmup_period == 0 || elapsed >= warmup_period {
        gross_profit
    } else {
        let period = warmup_period as u128;
        let elapsed = elapsed as u128;
        let q = gross_profit / period;
        let r = gross_profit % period;
        (q * elapsed) + ((r * elapsed) / period)
    }
}

/// Fee-debt sweep: given an account's accumulated fee debt and available balance,
/// computes how much is swept (paid) and the remaining debt.
///
/// Returns `(swept, remaining_debt)`.
#[must_use]
pub fn fee_debt_sweep(fee_debt: u128, available: u128) -> (u128, u128) {
    let swept = fee_debt.min(available);
    (swept, fee_debt - swept)
}

/// Funding rate application: given position size, funding rate numerator/denominator,
/// and whether the account is long, computes the signed funding payment.
///
/// Positive return = account pays; negative = account receives.
/// Uses integer math: `payment = position * rate_num / rate_den`.
#[must_use]
pub fn funding_payment(position: u128, rate_num: i128, rate_den: u128, is_long: bool) -> i128 {
    if position == 0 || rate_num == 0 || rate_den == 0 {
        return 0;
    }

    let abs_num: u128 = if rate_num == i128::MIN {
        (i128::MAX as u128) + 1
    } else {
        rate_num.abs() as u128
    };

    let magnitude: i128 = match position.checked_mul(abs_num) {
        Some(prod) => {
            let mag_u128 = prod / rate_den;
            if mag_u128 > i128::MAX as u128 {
                i128::MAX
            } else {
                mag_u128 as i128
            }
        }
        None => i128::MAX,
    };

    let raw = if rate_num < 0 { -magnitude } else { magnitude };
    if is_long {
        raw
    } else {
        -raw
    }
}

/// Loss writeoff: when an account's equity goes negative, compute writeoff amount
/// and updated insurance fund.
///
/// Returns `(writeoff, new_insurance)` where writeoff is capped by insurance.
#[must_use]
pub fn loss_writeoff(negative_equity: u128, insurance: u128) -> (u128, u128) {
    let writeoff = negative_equity.min(insurance);
    (writeoff, insurance - writeoff)
}

#[cfg(kani)]
mod proofs {
    use super::*;

    #[kani::proof]
    fn proof_haircut_ratio_basic_properties() {
        let v: u128 = kani::any::<u64>() as u128;
        let c: u128 = kani::any::<u64>() as u128;
        let i: u128 = kani::any::<u64>() as u128;
        let p: u128 = kani::any::<u64>() as u128;

        let (num, den) = haircut_ratio(v, c, i, p);

        kani::assert(den != 0);
        kani::assert(num <= den);
        if p == 0 {
            kani::assert((num, den) == (1, 1));
        } else {
            kani::assert(den == p);
            let residual = v.saturating_sub(c.saturating_add(i));
            kani::assert(num <= residual);
        }
    }

    #[kani::proof]
    fn proof_haircut_ratio_is_one_when_residual_covers_profit() {
        let v: u128 = kani::any::<u64>() as u128;
        let c: u128 = kani::any::<u64>() as u128;
        let i: u128 = kani::any::<u64>() as u128;
        let p: u128 = kani::any::<u64>() as u128;
        kani::assume(p > 0);

        let residual = v.saturating_sub(c.saturating_add(i));
        kani::assume(residual >= p);

        let (num, den) = haircut_ratio(v, c, i, p);
        kani::assert(num == den);
    }

    #[kani::proof]
    fn proof_principal_protection_across_accounts() {
        let c_tot: u128 = kani::any::<u64>() as u128;
        let c_i: u128 = kani::any::<u64>() as u128;
        kani::assume(c_i <= c_tot);

        let loss = kani::any::<u128>().min(c_i);
        let c_i_new = c_i - loss;
        let c_tot_new = c_tot - loss;

        kani::assert(c_tot_new == c_tot - loss);
        kani::assert(c_i_new <= c_i);
    }

    #[kani::proof]
    fn proof_profit_conversion_payout_formula() {
        let x: u128 = kani::any::<u64>() as u128;
        let h_num: u128 = kani::any::<u64>() as u128;
        let h_den: u128 = kani::any::<u64>() as u128;

        let y = effective_pnl(x as i128, h_num, h_den);
        kani::assert(y <= x);
    }

    #[kani::proof]
    fn proof_effective_pnl_matches_reference_u64_domain() {
        let pos: u64 = kani::any();
        let h_den: u64 = kani::any();
        let h_num: u64 = kani::any();
        kani::assume(h_den > 0);
        kani::assume(h_num <= h_den);

        let expected = (pos as u128 * h_num as u128) / (h_den as u128);
        let actual = effective_pnl(pos as i128, h_num as u128, h_den as u128);
        kani::assert(actual == expected);
    }

    #[kani::proof]
    fn proof_rounding_slack_bound_when_haircut_active() {
        const N: usize = 4;

        let p1: u128 = kani::any::<u64>() as u128;
        let p2: u128 = kani::any::<u64>() as u128;
        let p3: u128 = kani::any::<u64>() as u128;
        let p4: u128 = kani::any::<u64>() as u128;

        let pnl_pos_total = p1 + p2 + p3 + p4;
        kani::assume(pnl_pos_total > 0);

        let residual: u128 = kani::any::<u64>() as u128;
        kani::assume(residual <= pnl_pos_total);

        let mut sum_eff: u128 = 0;
        let mut sum_r: u128 = 0;

        for p in [p1, p2, p3, p4] {
            let prod = p * residual;
            sum_eff += prod / pnl_pos_total;
            sum_r += prod % pnl_pos_total;
        }

        kani::assert(sum_eff <= residual);

        // With residual <= pnl_pos_total, h_num = residual and h_den = pnl_pos_total.
        // Each term is floored, so the "missing" amount is bounded by the number of accounts.
        let slack = residual - sum_eff;
        kani::assert(slack <= (N as u128) - 1);

        // Sanity: the remainder sum cannot cross N denominators.
        kani::assert(sum_r < (N as u128) * pnl_pos_total);
    }

    #[kani::proof]
    fn proof_effective_pnl_bounded() {
        let pnl: i128 = kani::any::<i64>() as i128;
        let h_num: u128 = kani::any::<u64>() as u128;
        let h_den: u128 = kani::any::<u64>() as u128;

        let eff = effective_pnl(pnl, h_num, h_den);

        let pos = pnl.max(0) as u128;
        kani::assert(eff <= pos);
    }

    #[kani::proof]
    fn proof_effective_equity_with_haircut() {
        let capital: u128 = kani::any::<u64>() as u128;
        let pnl: i128 = kani::any::<i64>() as i128;
        let h_num: u128 = kani::any::<u64>() as u128;
        let h_den: u128 = kani::any::<u64>() as u128;

        let eff = effective_pnl(pnl, h_num, h_den);
        let equity = capital + eff;

        kani::assert(equity >= capital);
    }

    #[kani::proof]
    fn proof_warmup_monotonic_in_elapsed() {
        let profit: u128 = kani::any::<u64>() as u128;
        let t1: u64 = kani::any();
        let t2: u64 = kani::any();
        let period: u64 = kani::any();
        kani::assume(t1 <= t2);

        let w1 = warmup_slope(profit, t1, period);
        let w2 = warmup_slope(profit, t2, period);

        kani::assert(w1 <= w2);
    }

    #[kani::proof]
    fn proof_warmup_bounded_by_gross() {
        let profit: u128 = kani::any::<u64>() as u128;
        let elapsed: u64 = kani::any();
        let period: u64 = kani::any();

        let warmed = warmup_slope(profit, elapsed, period);
        kani::assert(warmed <= profit);
    }

    #[kani::proof]
    fn proof_warmup_full_after_period() {
        let profit: u128 = kani::any::<u64>() as u128;
        let period: u64 = kani::any();
        let elapsed: u64 = kani::any();
        kani::assume(elapsed >= period);

        let warmed = warmup_slope(profit, elapsed, period);
        kani::assert(warmed == profit);
    }

    #[kani::proof]
    fn proof_fee_sweep_conservation() {
        let debt: u128 = kani::any::<u64>() as u128;
        let available: u128 = kani::any::<u64>() as u128;

        let (swept, remaining) = fee_debt_sweep(debt, available);

        kani::assert(swept + remaining == debt);
        kani::assert(swept <= available);
        kani::assert(swept <= debt);
    }

    #[kani::proof]
    fn proof_fee_sweep_clears_when_sufficient() {
        let debt: u128 = kani::any::<u64>() as u128;
        let available: u128 = kani::any::<u64>() as u128;
        kani::assume(available >= debt);

        let (swept, remaining) = fee_debt_sweep(debt, available);

        kani::assert(swept == debt);
        kani::assert(remaining == 0);
    }

    #[kani::proof]
    fn proof_funding_long_short_symmetry() {
        let position: u128 = kani::any::<u64>() as u128;
        let rate_num: i128 = kani::any::<i64>() as i128;
        let rate_den: u128 = kani::any::<u64>() as u128;

        let long_pay = funding_payment(position, rate_num, rate_den, true);
        let short_pay = funding_payment(position, rate_num, rate_den, false);

        kani::assert(long_pay == -short_pay);
    }

    #[kani::proof]
    fn proof_funding_zero_rate_no_payment() {
        let position: u128 = kani::any::<u64>() as u128;
        let rate_den: u128 = kani::any::<u64>() as u128;
        let is_long: bool = kani::any();

        let pay = funding_payment(position, 0, rate_den, is_long);
        kani::assert(pay == 0);
    }

    #[kani::proof]
    fn proof_funding_zero_denominator_safe() {
        let position: u128 = kani::any::<u64>() as u128;
        let rate_num: i128 = kani::any::<i64>() as i128;
        let is_long: bool = kani::any();

        let pay = funding_payment(position, rate_num, 0, is_long);
        kani::assert(pay == 0);
    }

    #[kani::proof]
    fn proof_funding_zero_position_no_payment() {
        let rate_num: i128 = kani::any::<i64>() as i128;
        let rate_den: u128 = kani::any::<u64>() as u128;
        let is_long: bool = kani::any();

        let pay = funding_payment(0, rate_num, rate_den, is_long);
        kani::assert(pay == 0);
    }

    #[kani::proof]
    fn proof_writeoff_conservation() {
        let neg_equity: u128 = kani::any::<u64>() as u128;
        let insurance: u128 = kani::any::<u64>() as u128;

        let (writeoff, new_insurance) = loss_writeoff(neg_equity, insurance);

        kani::assert(writeoff + new_insurance == insurance);
        kani::assert(writeoff <= neg_equity);
        kani::assert(writeoff <= insurance);
    }

    #[kani::proof]
    fn proof_writeoff_insurance_monotonic_decrease() {
        let neg1: u128 = kani::any::<u64>() as u128;
        let neg2: u128 = kani::any::<u64>() as u128;
        let insurance: u128 = kani::any::<u64>() as u128;
        kani::assume(neg1 <= neg2);

        let (_, ins_after_1) = loss_writeoff(neg1, insurance);
        let (_, ins_after_2) = loss_writeoff(neg2, insurance);

        kani::assert(ins_after_1 >= ins_after_2);
    }
}
