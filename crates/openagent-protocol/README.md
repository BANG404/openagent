# OpenAgent protocol

This crate owns the transport-independent, serializable contract shared by the
Rust execution engine, desktop transport, authenticated HTTP transport, and
external clients. It contains raw input and slash-command resolution, model
binding, interrupt, submission, and protocol-version types. It has no provider,
tool, persistence, workspace, event-bus, or desktop dependency.

Run its unit tests:

```powershell
cargo test --manifest-path crates/Cargo.toml -p openagent-protocol
```

Start the deterministic loopback contract API without an execution engine:

```powershell
cargo run --manifest-path crates/Cargo.toml -p openagent-protocol `
  --features test-api --example contract_api -- --port 0
```

The public product library and standalone Runtime consume the same contracts.
Execution and conversation-storage implementation remain private.
