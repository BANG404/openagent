# Public SDK boundary

`typescript/` owns the behavior-free OpenAgent client, public contracts, and
browser/Tauri transports. This source is maintained and verified in the host
repository. Do not copy Rust execution, prompts, provider payloads, persistence,
diagnostics, or private Runtime documentation here.

Update contracts, transport adapters, and callers together. Product operations
use the typed operation map; desktop-only capabilities remain explicit. Runtime
implementation belongs in the private `runtime/` submodule; read its `AGENTS.md`
before changing it. Public SDK validation and client distribution use this
host checkout; private releases stamp only Rust package metadata.

Root preflight includes SDK type checking, lint, formatting, and Bun tests.
Keep transport mock fixtures under `typescript/tests/` so module resolution uses
the SDK's Tauri installation in both standalone SDK CI and root test runs.
Frontend and automation CI consume this directory directly without credentials
or a downloaded client snapshot. `@openagent/client` always resolves this source,
including when a signed development Runtime kit has been prepared.

The package's `private` flag prevents npm publication and does not change source
visibility. Add intentional public SDK files to
`.githooks/public-sdk-sources.txt`; unlisted SDK source blocks delivery and push.

Public Rust wire contracts generate `typescript/src/protocol.generated.ts` through
`bun run generate:protocol`; preflight and frontend/native CI reject stale output with
`bun run check:protocol`. Keep Serde names, defaults, optionality and nullability
on the Rust source. Event envelopes use generic domain projections, then the
client binds those projections in `OpenAgentEventMap`; do not hand-copy envelope
fields into TypeScript. Transport dispatch remains handwritten.

`OpenAgentClient` and `OpenAgentTransport` expose typed product operations and
subscriptions only. Native invoke/listen/emit and live Runtime lifecycle status
belong exclusively to `tauriClient`; Tauri is an optional peer dependency.
Tauri product requests always use the supervised standalone Runtime. A failed
request or unavailable process never selects an embedded engine or a direct
product command. Setup and installation continue using the explicit native entry.

Published client archives are buildable source snapshots, independent of Runtime
installation. `create-client-source-snapshot.mjs` includes source, lockfile, build
configuration and package documentation. See the package README for consumption;
never advertise the archive as a ready-to-install npm distribution.
