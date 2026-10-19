# Public Rust product boundary

`openagent-app` owns product policies and communicates with the independently
distributed Runtime through HTTP. It must compile without private repositories.
`openagent-protocol` owns serializable contracts shared by public clients and
the private server; keep it free of execution, providers, SQL, and Tauri.
`openagent-config` owns product settings, defaults, normalization, and atomic
file persistence. Runtime generation options and permission enforcement remain
private; public configuration carries only their declared inputs.

Runtime-owned conversation storage remains accessible through its protocol only.
Conversation inbox contracts live in `openagent-protocol/src/input_queue.rs`;
queue acceptance, persistence, steering and dispatch remain Runtime-owned.
Do not copy private checkpoints, provider projection, execution loops, sandbox
enforcement, or prompt assembly into these crates. Product paths, defaults,
resource installation and user-facing configuration belong in public source.

Use the root preflight for qualification. The public Rust workspace must be
included in native CI and dependency-boundary verification.
Register intentional Rust source in `.githooks/public-product-sources.txt`.

The native HTTP boundary lives in `src-tauri/src/runtime_transport.rs`; do not
add a second App HTTP client. Internal `publish = false` crates inherit the
public workspace version and have no individual release train.
`openagent-protocol` owns generated TypeScript wire declarations, including
generic event envelopes. Its optional `typescript` feature supplies code
generation only; production consumers need no TypeScript generator dependency.
