# Public SDK boundary

`typescript/` owns the behavior-free OpenAgent client, public contracts,
browser/Tauri transports, and the explicit Node/Bun `runtime` entry for binary
installation and process supervision. This source is maintained and verified in the host
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

The default entry stays browser-safe; only `@bang404/openagent-sdk/runtime` may
import Node filesystem, crypto or process APIs. Installation has no download or
execution lifecycle hooks. Add intentional public SDK files to
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

The npm package contains compiled Node ESM with explicit `.js` relative imports
and declarations. Its fixed recommended Runtime manifest is embedded during
release packaging. Source checkouts require an explicit binary or release;
they never infer one from a moving channel. SDK and Runtime versioning remain
independent. The release owner documents publication, compatibility and retries
in `.agents/skills/openagent-release-engineering/references/client-sdk.md`.
Published `openagent-typescript-sdk.tar.gz` archives remain buildable source
snapshots. `create-client-source-snapshot.mjs` includes source, lockfile, build
configuration and documentation; these archives are separate from npm tarballs.
