//! Public product composition for the independently distributed Runtime.
//!
//! This library must build without private source, Tauri, model providers, or
//! the execution engine. Product hosts share its policies and communicate with
//! their supervised Runtime through the public protocol.

pub mod bootstrap;
pub mod client;
pub mod defaults;
pub mod embedding_resource;
pub mod paths;
pub mod persistence;
pub mod plugin_updates;
pub mod process_lifetime;
pub mod runtime_process;
pub use openagent_config as settings;
