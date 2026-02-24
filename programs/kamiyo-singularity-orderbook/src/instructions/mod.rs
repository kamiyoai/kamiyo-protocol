// Core modules (always included)
pub mod cancel_order;
pub mod initialize_config;
pub mod initialize_position;
pub mod place_order;
pub mod place_order_v2;
pub mod redeem;
pub mod resolve_market;
pub mod settle_trade;
pub mod update_keeper;

pub use cancel_order::*;
pub use initialize_config::*;
pub use initialize_position::*;
pub use place_order::*;
pub use place_order_v2::*;
pub use redeem::*;
pub use resolve_market::*;
pub use settle_trade::*;
pub use update_keeper::*;

// Optional: Event crank (batched event processing)
#[cfg(feature = "events")]
pub mod consume_events;
#[cfg(feature = "events")]
pub use consume_events::*;

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
