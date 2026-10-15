//! Public product composition for the independently distributed Runtime.
//!
//! This library must build without private source, Tauri, model providers, or
//! the execution engine. Product hosts share its policies and communicate with
//! their supervised Runtime through the public protocol.

pub mod client;
pub mod paths;
pub mod process_lifetime;
pub mod runtime_process;
pub use openagent_config as settings;
