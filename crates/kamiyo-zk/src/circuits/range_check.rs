//! Range check gadget using Zcash's Halo2
//!
//! Implements efficient range proofs using PLONKish lookup tables.
//! Based on techniques from halo2_gadgets.
//!
//! ## Reference
//!
//! The lookup-based range check is inspired by:
//! - https://zcash.github.io/halo2/design/gadgets/decomposition.html
//! - halo2_gadgets::utilities::decompose_word

use ff::PrimeField;
use halo2_proofs::{
    circuit::{AssignedCell, Layouter, Value},
    plonk::{Advice, Column, ConstraintSystem, Error, Selector, TableColumn},
    poly::Rotation,
};

/// Number of bits for score (0-100 fits in 7 bits)
pub const SCORE_BITS: usize = 7;

/// Configuration for range check via lookup table
#[derive(Clone, Debug)]
pub struct RangeCheckConfig<F: PrimeField> {
    /// Advice column for the value being checked
    value: Column<Advice>,
    /// Table column for valid values [0, 100]
    table: TableColumn,
    /// Selector for enabling lookup
    selector: Selector,
    _marker: std::marker::PhantomData<F>,
}

impl<F: PrimeField> RangeCheckConfig<F> {
    /// Configure the range check gadget
    pub fn configure(
        meta: &mut ConstraintSystem<F>,
        value: Column<Advice>,
    ) -> Self {
        let table = meta.lookup_table_column();
        let selector = meta.complex_selector();

        // Lookup: value must be in table
        meta.lookup(|meta| {
            let s = meta.query_selector(selector);
            let v = meta.query_advice(value, Rotation::cur());

            vec![(s * v, table)]
        });

        Self {
            value,
            table,
            selector,
            _marker: std::marker::PhantomData,
        }
    }

    /// Load the range table [0, 100]
    pub fn load_table(&self, layouter: &mut impl Layouter<F>) -> Result<(), Error> {
        layouter.assign_table(
            || "score range table",
            |mut table| {
                for i in 0..=100u64 {
                    table.assign_cell(
                        || format!("value {}", i),
                        self.table,
                        i as usize,
                        || Value::known(F::from(i)),
                    )?;
                }
                Ok(())
            },
        )
    }

    /// Check that a value is in range [0, 100]
    pub fn check_range(
        &self,
        layouter: &mut impl Layouter<F>,
        value: &AssignedCell<F, F>,
    ) -> Result<(), Error> {
        layouter.assign_region(
            || "range check",
            |mut region| {
                self.selector.enable(&mut region, 0)?;
                value.copy_advice(|| "value", &mut region, self.value, 0)?;
                Ok(())
            },
        )
    }
}

/// Decompose a value into bits for range checking
///
/// This is useful for checking values that don't fit in a small table.
pub fn decompose_bits<F: PrimeField>(value: u64, num_bits: usize) -> Vec<bool> {
    (0..num_bits).map(|i| (value >> i) & 1 == 1).collect()
}

/// Recompose bits into a field element
pub fn recompose_bits<F: PrimeField>(bits: &[bool]) -> F {
    bits.iter().enumerate().fold(F::ZERO, |acc, (i, &bit)| {
        if bit {
            acc + F::from(1u64 << i)
        } else {
            acc
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use pasta_curves::pallas;

    #[test]
    fn test_decompose_recompose() {
        let value = 75u64;
        let bits = decompose_bits::<pallas::Base>(value, SCORE_BITS);
        let recomposed: pallas::Base = recompose_bits(&bits);
        assert_eq!(recomposed, pallas::Base::from(value));
    }

    #[test]
    fn test_score_fits_in_7_bits() {
        // 100 = 0b1100100, needs 7 bits
        assert!(100u64 < (1 << SCORE_BITS));
        // 127 is max for 7 bits
        assert!(127u64 < (1 << SCORE_BITS));
        // 128 doesn't fit
        assert!(128u64 >= (1 << SCORE_BITS));
    }
}
