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
Frontend and automation CI consume this directory directly without credentials
or a downloaded client snapshot. `@openagent/client` always resolves this source,
including when a signed development Runtime kit has been prepared.

The package's `private` flag prevents npm publication and does not change source
visibility. Add intentional public SDK files to
`.githooks/public-sdk-sources.txt`; unlisted SDK source blocks delivery and push.
