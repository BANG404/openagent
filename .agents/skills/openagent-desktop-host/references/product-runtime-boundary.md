# Public product and private execution

The public `crates/` workspace owns OpenAgent product composition and the Rust
wire contracts. `openagent-app` builds without the private repository and has
no execution-engine dependency. Tauri consumes it as a library, not as a third
process. Product CLI hosts can reuse the same library.

`openagent-config` is the public shared settings implementation: serialized
types, product defaults, validation, normalization, migration and atomic file
replacement. It has no provider client, engine dependency or conversation SQL.
Permission declarations are public inputs; effective policy enforcement and
conversion to model-provider generation options remain private.

The private Runtime remains a supervised binary. Ordinary desktop clients use
authenticated loopback HTTP and the existing event channel. Public contracts
contain serializable requests and responses, protocol versions and capabilities;
they must not expose Rig, database handles, internal checkpoint formats or model
prompt assembly. The TypeScript SDK remains the ordinary frontend input route.

Product-owned responsibilities are data-root and launch-workspace selection,
default configuration and skills, onboarding and appearance, resource download
and verification, plugin installation/update policy, and Runtime distribution,
activation and rollback. Native window and OS adapters remain in `src-tauri`.

Runtime-owned responsibilities are agent execution, provider projection, tools,
permissions and sandbox enforcement, cancellation, compaction, and durable
conversation/checkpoint/attachment storage. Product code queries and changes that
storage only through the protocol. Storage inspection and migrations remain
with the version of the engine that understands the data; product code owns
the user-facing transition decision and backup destination policy.

Product configuration has one persistence owner. Execution consumes validated,
versioned configuration; do not introduce independent competing writers to one
file or open the Runtime's SQLite store from the product library.

The public protocol is the source of truth for version constants. Public Rust
changes select native CI, including standalone product/protocol formatting,
Clippy and tests. Verify the product dependency graph without private source.
Runtime artifacts retain signature/hash admission, loopback authentication,
parent-liveness, bounded exit, and stop-before-start activation semantics.

Plugin daemon lifecycle is generic and keyed by validated package identity.
The native shell adds no named-plugin launch flags, endpoints or commands.
Direct MCP plugins own their children through the ordinary Runtime process
boundary; the shell never starts a parallel application for them.
