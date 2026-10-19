# OpenAgent TypeScript SDK

Public typed, behavior-free clients and browser/Tauri transports, maintained in
`sdk/typescript` in the OpenAgent repository. Runtime execution, prompts,
providers, persistence, and checkpoints remain in the private `runtime/`
submodule and the supervised Runtime process.

```ts
import { OpenAgentClient } from "./src/client";
import { HttpTransport } from "./src/httpTransport";

const client = new OpenAgentClient(new HttpTransport());
```

Frontends use the source in their host checkout via `@openagent/client`.
Root type, lint, format, and Bun test commands cover this package without
private source access; trusted preflight also verifies the Runtime pin.
The package remains private to prevent accidental npm
publication; its source is public under MIT. The general entry and HTTP transport
have no Tauri runtime dependency. Desktop applications explicitly import
`tauriClient` or `tauriTransport`; the Tauri API is an optional peer dependency.
Native windows, installation and local events use `tauriClient` rather than
methods on the general client. Product operations retain their typed command map.

Release archives named `openagent-typescript-sdk.tar.gz` are **source snapshots**,
not npm packages. Extract the archive, run `bun install --frozen-lockfile`, then
`bun run build` before using the `dist` exports with a bundler. Bun and TypeScript
bundlers can also import `src/index.ts` or `src/httpTransport.ts` directly.
The snapshot includes the lockfile, both TypeScript configurations, README and
license. It carries the Client SDK package version independently of the Runtime
version in the signed manifest. No npm distribution is published.

Public Rust protocol declarations generate `src/protocol.generated.ts` with
`bun run generate:protocol` from the host root. Operation transports stay
handwritten; input, queue, resource and event envelope fields come from Rust.
`bun run check:protocol` detects field and nullability drift as well as version
drift. Event domain projections are supplied as generic types at the client edge.

`getInputQueue` and `mutateInputQueue` expose the Runtime-owned conversation
inbox over the same HTTP API in browser and Tauri transports. Additions carry
stable user and assistant message IDs; reuse them when retrying an uncertain
acceptance. Edits and reordering include the observed revision. Steering carries
an expected active run ID and cannot override its model. Queue snapshots and
`onInputQueueChanged` are projections; SDK clients never dispatch pending items.
The paired conversation-state stream also includes its input queue.
