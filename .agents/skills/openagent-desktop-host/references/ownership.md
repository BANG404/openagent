# Host ownership and contracts

Keep Rust host code limited to thin binary entry points, the Tauri builder,
command and event adapters, desktop capabilities, build configuration, and
packaging metadata. Ordinary frontend input goes through the shared SDK
client; do not duplicate flow selection, slash-command parsing,
configuration ownership, database operations, or runtime state machines in
the host.

## Runtime and SDK roles

- Ordinary host builds must not link private SDK Rust crates. Compile and stage
  `openagent-server` first, then use its versioned desktop-bootstrap JSON command
  for compatibility inspection, confirmed persistence transitions, locale, and
  launch inputs. Private Rust dependencies are allowed only behind the explicit
  `embedded-runtime` diagnostic feature.
- The supervised desktop server keeps the complete Harness `/v1` router
  and adds the product `/api` router through `--desktop-api`. Both
  surfaces must execute in that one server process; do not introduce an
  embedded or parallel agent Runtime for desktop Harness behavior.
- Change IPC contracts atomically across the SDK contract or adapter,
  public frontend types, and every caller.
- Route every Runtime-owned frontend operation through the shared SDK client.
  Direct Tauri `invoke` calls are reserved for commands registered by the thin
  production host, and the typed desktop-operation list must stay identical to
  the supervised Runtime's HTTP dispatch surface.

## Replaceable Runtime supervisor

- Keep signed Runtime download, installation, activation selection, desktop
  process spawning, and other OS-local capabilities in public host modules.
- Accept only compatible loopback readiness records and authenticate
  health probes with a process-scoped token.
- On Windows, assign every supervised Runtime to a host-owned kill-on-close Job
  Object before accepting readiness. The Runtime must also treat control-pipe
  EOF as owner loss, so abnormal host exit cannot leave a primary server,
  channel adapter, or durable-state writer behind.
- Stop the old child through its private control pipe before starting a
  candidate, and restart the previous verified launch on failure.
- Release desktop startup must use that supervised process as the only
  durable-state Runtime; the packaged server is a fallback binary, not a
  concurrent writer.

## Bundled Cua Driver daemon

- Stage the pinned Cua Driver release into the product's per-user cache
  (`<cache>/openagent/cua-driver/<release-digest>/`) and start the daemon from
  there, never from the bundled resource directory. That directory belongs to
  the build and the installer: a development rebuild rewrites it in place, and
  writing to the file a live daemon is executing fails with `ETXTBSY` on Unix
  and with a sharing violation on Windows.
- Stop the daemon this process spawned on every product exit path, including
  the quit watchdog that force-exits a hung shutdown. A daemon another
  OpenAgent process owns is never this process's to stop.

## Activation and update barrier

- Component activation must acquire the Runtime's graceful update barrier
  before replacing a Runtime, reloading product WebViews, or restarting
  the desktop shell.
- Never cancel active Agent work for an update. Defer activation when the
  bounded wait cannot drain naturally, and release the barrier after
  failure or a confirmed frontend-only reload.

## Authenticated proxy and SSE bus

- Keep the supervised Runtime Bearer token in Rust. WebViews send only
  bounded `/api` method/path/body requests through the host proxy, while
  Rust attaches authentication and relays the Runtime SSE bus to existing
  Tauri event names.
- A lagged or disconnected SSE stream must stop live delivery and request
  a durable frontend resync before a new stream is started.

## Asset protocols and native opener

- The product-managed Cua Driver resource must be placed on the child-process
  `PATH` before any Runtime bootstrap in development mode, because the
  embedded diagnostic can initialize MCP connections before Tauri `setup`.
  Tauri `Resource` resolution remains the packaged path; development startup
  may fall back to the source or debug resource directory.
- Rewrite Runtime media and HTML asset URLs to the host-owned
  `openagent-runtime` protocol. Permit only GET/HEAD requests for bounded
  media and HTML asset paths, preserve byte-range response headers, and
  attach the process token only in Rust.
- Resolve workspace paths in the Runtime before the host invokes the
  native opener. Native open requests must select the active Runtime mode
  at runtime: ordinary debug and release shells use the supervised
  Runtime proxy, while the explicit embedded diagnostic uses its managed
  Runtime state. Do not select this boundary with compile-time debug
  cfgs.
- Serve replaceable frontend versions only through the host-owned
  `openagent-ui` protocol. Activation must atomically retain the previous
  selection, reload every product WebView with the candidate version,
  require a mounted-frontend confirmation, and fall back to the embedded
  frontend when no verified previous selection exists.
