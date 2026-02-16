use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod instructions;
mod transactions;
mod types;
pub use transactions::*;

#[derive(FuzzTestMethods)]
struct FuzzTest {
    /// for fuzzing
    trident: Trident,
    /// for storing fuzzing accounts
    fuzz_accounts: FuzzAccounts,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: FuzzAccounts::default(),
        }
    }

    #[init]
    fn start(&mut self) {
        let mut oracle_registry =
            InitializeOracleRegistryTransaction::build(&mut self.trident, &mut self.fuzz_accounts);
        self.trident
            .execute_transaction(&mut oracle_registry, Some("init_oracle_registry"));

        let mut blacklist_registry = InitializeBlacklistRegistryTransaction::build(
            &mut self.trident,
            &mut self.fuzz_accounts,
        );
        self.trident
            .execute_transaction(&mut blacklist_registry, Some("init_blacklist_registry"));
    }

    #[flow]
    fn flow1(&mut self) {
        match self.trident.gen_range(0..2) {
            0 => {
                let mut tx = SetPublicRegistrationTransaction::build(
                    &mut self.trident,
                    &mut self.fuzz_accounts,
                );
                self.trident.execute_transaction(&mut tx, Some("oracle_set_public_registration"));
            }
            _ => {
                let mut tx =
                    ResetOracleRegistryTransaction::build(&mut self.trident, &mut self.fuzz_accounts);
                self.trident.execute_transaction(&mut tx, Some("oracle_reset_registry"));
            }
        }
    }

    #[flow]
    fn flow2(&mut self) {
        match self.trident.gen_range(0..2) {
            0 => {
                let mut tx =
                    AddToBlacklistTransaction::build(&mut self.trident, &mut self.fuzz_accounts);
                self.trident
                    .execute_transaction(&mut tx, Some("blacklist_add"));
            }
            _ => {
                let mut tx = RemoveFromBlacklistTransaction::build(
                    &mut self.trident,
                    &mut self.fuzz_accounts,
                );
                self.trident
                    .execute_transaction(&mut tx, Some("blacklist_remove"));
            }
        }
    }

    #[end]
    fn end(&mut self) {
        // perform any cleaning here, this method will be executed
        // at the end of each iteration
    }
}

fn main() {
    let iterations = std::env::var("TRIDENT_ITERATIONS")
        .ok()
        .and_then(|val| val.parse().ok())
        .unwrap_or(1000);

    let flow_calls = std::env::var("TRIDENT_FLOW_CALLS")
        .ok()
        .and_then(|val| val.parse().ok())
        .unwrap_or(100);

    FuzzTest::fuzz(iterations, flow_calls);
}
