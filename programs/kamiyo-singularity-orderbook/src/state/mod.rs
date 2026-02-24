// Core state (always included)
pub mod config;
pub mod event_heap;
pub mod open_orders;
pub mod oracle;
pub mod order;
pub mod orderbook;
pub mod position;

pub use config::*;
pub use event_heap::*;
pub use open_orders::*;
pub use oracle::*;
pub use order::*;
pub use orderbook::*;
pub use position::*;

// Optional: AI trading agents
#[cfg(feature = "agents")]
pub mod trading_agent;
#[cfg(feature = "agents")]
pub use trading_agent::*;

// Optional: Social/copy trading
#[cfg(feature = "social")]
pub mod social;
#[cfg(feature = "social")]
pub use social::*;

// Optional: Enterprise multi-tenancy
#[cfg(feature = "enterprise")]
pub mod enterprise;
#[cfg(feature = "enterprise")]
pub use enterprise::*;

// Optional: DeFi integrations
#[cfg(feature = "defi")]
pub mod defi;
#[cfg(feature = "defi")]
pub use defi::*;
