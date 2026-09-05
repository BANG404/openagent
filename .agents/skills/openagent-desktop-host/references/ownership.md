# Host ownership and contracts

Keep Rust host code limited to thin binary entry points, the Tauri builder,
command and event adapters, desktop capabilities, build configuration, and
packaging metadata. Ordinary frontend input goes through the shared SDK
client; do not duplicate flow selection, slash-command parsing,
configuration ownership, database operations, or runtime state machines in
the host.

## Runtime and SDK roles

- Use `openagent-app` only for product bootstrap and `openagent-runtime`
  for execution APIs.
- The supervised desktop server keeps the complete Harness `/v1` router
  and adds the product `/api` router through `--desktop-api`. Both
  surfaces must execute in that one server process; do not introduce an
  embedded or parallel agent Runtime for desktop Harness behavior.
- Change IPC contracts atomically across the SDK contract or adapter,
  public frontend types, and every caller.

## Replaceable Runtime supervisor

- Accept only compatible loopback readiness records and authenticate
  health probes with a process-scoped token.
- Stop the old child through its private control pipe before starting a
  candidate, and restart the previous verified launch on failure.
- Release desktop startup must use that supervised process as the only
  durable-state Runtime; the packaged server is a fallback binary, not a
  concurrent writer.

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
