# OpenAgent TypeScript SDK

Public typed, behavior-free clients and browser/Tauri transports, maintained in
`sdk/typescript` in the OpenAgent repository. Runtime execution, prompts,
providers, persistence, and checkpoints remain in the private `runtime/`
submodule and the supervised Runtime process.

```sh
bun add @bang404/openagent-sdk
```

```ts
import { OpenAgentClient } from "@bang404/openagent-sdk";
import { HttpTransport } from "@bang404/openagent-sdk/httpTransport";

const client = new OpenAgentClient(new HttpTransport());
```

Frontends use the source in their host checkout via `@openagent/client`.
Root type, lint, format, and Bun test commands cover this package without
private source access; trusted preflight also verifies the Runtime pin.
The package is public under MIT. The general entry and HTTP transport
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
version in the signed manifest. The npm package separately ships compiled ESM
and declarations and runs under Node 22+ or Bun without a consumer build step.

## Local Runtime (Node/Bun)

One package also supplies the explicit `@bang404/openagent-sdk/runtime` entry.
It downloads no binaries during npm installation. Published SDKs pin a recommended
Runtime kit; `ensureRuntime()` downloads it on demand or verifies an existing
cached installation, including its signed manifest, binary and sandbox helpers.
Cache defaults to `~/.cache/openagent-sdk/runtime`; set `cacheDirectory` to use
another location or preload a verified kit for offline use.

```ts
import { startRuntime } from "@bang404/openagent-sdk/runtime";

const runtime = await startRuntime({
  workspace: "/absolute/path/to/workspace",
  home: "/absolute/path/to/my-app-data",
  // binaryPath: "/path/to/existing/openagent-server", // optional trusted binary
});
try {
  const settings = await runtime.client.invokeProduct("get_settings", {});
} finally {
  await runtime.stop();
}
```

The Runtime uses an isolated data root selected by your application. Do not point
it at data owned by a running OpenAgent desktop. Startup inspects persistence
compatibility first and refuses transitions requiring host action. It never
resets data or replaces an existing running process. Node/plugin commands and
terminal tools must be available in the host environment as required by your
enabled capabilities; configure providers through the ordinary product API.

An explicit existing binary is checked at startup against this SDK's protocol
and the recommended Runtime's minimum version/major boundary. To connect to an
already running local Runtime, call `connectRuntime({ ...ready, token })` with
the readiness record and bearer token supplied by its process owner; the SDK
checks the live health PID and takes no process ownership. Keep that token private.
Browser clients use the paired remote gateway instead of the local Runtime entry.

SDK versions are independent of software and Runtime versions. Beta/RC/Stable
software releases build and qualify the package, publish its fixed Runtime kit
first, and publish npm under `beta`/`rc`/`latest`. An unchanged SDK/recommendation
reuses its version. Source checkouts have no embedded recommendation; supply an
explicit `binaryPath` or trusted release metadata when developing from source.

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
