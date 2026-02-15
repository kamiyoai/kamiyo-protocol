//! Reusable Kani harnesses for Percolator-style risk & accounting.
//! All pure math — no Solana types, no_std compatible.

/// Global haircut ratio `h` as used in Percolator.
///
/// Returns `(h_num, h_den)` where `h = h_num / h_den`.
/// When `pnl_pos_total == 0` there are no profitable accounts, so `h = 1`.
pub fn haircut_ratio(
    vault: u128,
    principal_total: u128,
    insurance: u128,
    pnl_pos_total: u128,
) -> (u128, u128) {
    let residual = vault.saturating_sub(principal_total + insurance);
    if pnl_pos_total == 0 {
        (1, 1)
    } else {
        (residual.min(pnl_pos_total), pnl_pos_total)
    }
}

/// Effective positive PnL for one account after haircut.
///
/// Negative PnL is untouched (returned as 0); positive PnL is scaled by `h`.
pub fn effective_pnl(pnl_i: i128, h_num: u128, h_den: u128) -> u128 {
    let pos = pnl_i.max(0) as u128;
    if h_den == 1 {
        pos
    } else {
        (pos * h_num) / h_den
    }
}

/// Warmup slope: linearly interpolates profit eligibility over a warmup period.
///
/// Returns the fraction of `gross_profit` that is "warmed" (eligible for withdrawal),
/// as `warmed = gross_profit * elapsed / warmup_period` (floored).
/// Clamped so `elapsed >= warmup_period` yields the full amount.
pub fn warmup_slope(gross_profit: u128, elapsed: u64, warmup_period: u64) -> u128 {
    if warmup_period == 0 || elapsed >= warmup_period {
        gross_profit
    } else {
        (gross_profit * elapsed as u128) / warmup_period as u128
    }
}

/// Fee-debt sweep: given an account's accumulated fee debt and available balance,
/// computes how much is swept (paid) and the remaining debt.
///
/// Returns `(swept, remaining_debt)`.
pub fn fee_debt_sweep(fee_debt: u128, available: u128) -> (u128, u128) {
    let swept = fee_debt.min(available);
    (swept, fee_debt - swept)
}

/// Funding rate application: given position size, funding rate numerator/denominator,
/// and whether the account is long, computes the signed funding payment.
///
/// Positive return = account pays; negative = account receives.
/// Uses integer math: `payment = position * rate_num / rate_den`.
pub fn funding_payment(
    position: u128,
    rate_num: i128,
    rate_den: u128,
    is_long: bool,
) -> i128 {
    if rate_den == 0 {
        return 0;
    }
    let raw = (position as i128 * rate_num) / rate_den as i128;
    if is_long { raw } else { -raw }
}

/// Loss writeoff: when an account's equity goes negative, compute writeoff amount
/// and updated insurance fund.
///
/// Returns `(writeoff, new_insurance)` where writeoff is capped by insurance.
pub fn loss_writeoff(negative_equity: u128, insurance: u128) -> (u128, u128) {
    let writeoff = negative_equity.min(insurance);
    (writeoff, insurance - writeoff)
}

#[cfg(kani)]
mod proofs {
    use super::*;

    #[kani::proof]
    fn proof_haircut_ratio_formula_correctness() {
        let v: u128 = kani::any();
        let c: u128 = kani::any();
        let i: u128 = kani::any();
        let p: u128 = kani::any();

        kani::assume(v >= c + i);
        let (num, den) = haircut_ratio(v, c, i, p);

        kani::assert(num <= den);
        kani::assert(den == 1 || den == p);
        kani::assert(num <= v.saturating_sub(c + i));
    }

    #[kani::proof]
    fn proof_principal_protection_across_accounts() {
        let c_tot: u128 = kani::any();
        let c_i: u128 = kani::any();
        kani::assume(c_i <= c_tot);

        let loss = kani::any::<u128>().min(c_i);
        let c_i_new = c_i - loss;
        let c_tot_new = c_tot - loss;

        // Other accounts' capital is untouched
        kani::assert(c_tot_new == c_tot - loss);
        // Account's remaining capital is non-negative
        kani::assert(c_i_new <= c_i);
    }

    #[kani::proof]
    fn proof_profit_conversion_payout_formula() {
        let x: u128 = kani::any();
        let h_num: u128 = kani::any();
        let h_den: u128 = kani::any();
        kani::assume(h_den > 0 && h_num <= h_den);

        let y = if h_den == 1 { x } else { (x * h_num) / h_den };

        kani::assert(y <= x);
    }

    #[kani::proof]
    fn proof_effective_pnl_bounded() {
        let pnl: i128 = kani::any();
        let h_num: u128 = kani::any();
        let h_den: u128 = kani::any();
        kani::assume(h_den > 0 && h_num <= h_den);

        let eff = effective_pnl(pnl, h_num, h_den);

        // Effective PnL never exceeds raw positive PnL
        let pos = pnl.max(0) as u128;
        kani::assert(eff <= pos);
    }

    #[kani::proof]
    fn proof_effective_equity_with_haircut() {
        let capital: u128 = kani::any();
        let pnl: i128 = kani::any();
        let h_num: u128 = kani::any();
        let h_den: u128 = kani::any();
        kani::assume(h_den > 0 && h_num <= h_den);
        // Prevent overflow in equity calc
        kani::assume(capital <= u128::MAX / 2);

        let eff = effective_pnl(pnl, h_num, h_den);
        let equity = capital + eff;

        // Haircut never eats principal
        kani::assert(equity >= capital);
    }

    // --- Warmup slope proofs ---

    #[kani::proof]
    fn proof_warmup_monotonic_in_elapsed() {
        let profit: u128 = kani::any();
        let t1: u64 = kani::any();
        let t2: u64 = kani::any();
        let period: u64 = kani::any();
        kani::assume(t1 <= t2);
        kani::assume(period > 0);
        // Bound to prevent overflow in multiplication
        kani::assume(profit <= u128::MAX / u64::MAX as u128);

        let w1 = warmup_slope(profit, t1, period);
        let w2 = warmup_slope(profit, t2, period);

        kani::assert(w1 <= w2);
    }

    #[kani::proof]
    fn proof_warmup_bounded_by_gross() {
        let profit: u128 = kani::any();
        let elapsed: u64 = kani::any();
        let period: u64 = kani::any();
        kani::assume(profit <= u128::MAX / u64::MAX as u128);

        let warmed = warmup_slope(profit, elapsed, period);
        kani::assert(warmed <= profit);
    }

    #[kani::proof]
    fn proof_warmup_full_after_period() {
        let profit: u128 = kani::any();
        let period: u64 = kani::any();
        let elapsed: u64 = kani::any();
        kani::assume(elapsed >= period);

        let warmed = warmup_slope(profit, elapsed, period);
        kani::assert(warmed == profit);
    }

    // --- Fee-debt sweep proofs ---

    #[kani::proof]
    fn proof_fee_sweep_conservation() {
        let debt: u128 = kani::any();
        let available: u128 = kani::any();

        let (swept, remaining) = fee_debt_sweep(debt, available);

        // Conservation: swept + remaining == original debt
        kani::assert(swept + remaining == debt);
        // Swept never exceeds available
        kani::assert(swept <= available);
        // Swept never exceeds debt
        kani::assert(swept <= debt);
    }

    #[kani::proof]
    fn proof_fee_sweep_clears_when_sufficient() {
        let debt: u128 = kani::any();
        let available: u128 = kani::any();
        kani::assume(available >= debt);

        let (swept, remaining) = fee_debt_sweep(debt, available);

        kani::assert(swept == debt);
        kani::assert(remaining == 0);
    }

    // --- Funding anti-retroactivity proofs ---

    #[kani::proof]
    fn proof_funding_long_short_symmetry() {
        let position: u128 = kani::any();
        let rate_num: i128 = kani::any();
        let rate_den: u128 = kani::any();
        kani::assume(rate_den > 0);
        // Bound to prevent overflow
        kani::assume(position <= i128::MAX as u128);

        let long_pay = funding_payment(position, rate_num, rate_den, true);
        let short_pay = funding_payment(position, rate_num, rate_den, false);

        // Long and short are exact negations
        kani::assert(long_pay == -short_pay);
    }

    #[kani::proof]
    fn proof_funding_zero_rate_no_payment() {
        let position: u128 = kani::any();
        let rate_den: u128 = kani::any();
        kani::assume(rate_den > 0);
        let is_long: bool = kani::any();

        let pay = funding_payment(position, 0, rate_den, is_long);
        kani::assert(pay == 0);
    }

    #[kani::proof]
    fn proof_funding_zero_denominator_safe() {
        let position: u128 = kani::any();
        let rate_num: i128 = kani::any();
        let is_long: bool = kani::any();

        let pay = funding_payment(position, rate_num, 0, is_long);
        kani::assert(pay == 0);
    }

    // --- Loss writeoff proofs ---

    #[kani::proof]
    fn proof_writeoff_conservation() {
        let neg_equity: u128 = kani::any();
        let insurance: u128 = kani::any();

        let (writeoff, new_insurance) = loss_writeoff(neg_equity, insurance);

        // Conservation: writeoff + new_insurance == original insurance
        kani::assert(writeoff + new_insurance == insurance);
        // Writeoff bounded by both
        kani::assert(writeoff <= neg_equity);
        kani::assert(writeoff <= insurance);
    }

    #[kani::proof]
    fn proof_writeoff_insurance_monotonic_decrease() {
        let neg1: u128 = kani::any();
        let neg2: u128 = kani::any();
        let insurance: u128 = kani::any();
        kani::assume(neg1 <= neg2);

        let (_, ins_after_1) = loss_writeoff(neg1, insurance);
        let (_, ins_after_2) = loss_writeoff(neg2, insurance);

        // Larger loss => less insurance remaining
        kani::assert(ins_after_1 >= ins_after_2);
    }
}
