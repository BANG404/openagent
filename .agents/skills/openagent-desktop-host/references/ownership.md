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
- Bind every long-lived child to this host through `process_lifetime.rs`. On
  Windows that module assigns the child to a host-owned kill-on-close Job
  Object before readiness is accepted; on Unix it is a no-op, and the child's
  own control pipe is the whole guarantee: the Runtime treats control-stdin EOF
  as loss of its desktop owner, so abnormal host exit cannot leave a primary
  server, channel adapter, or durable-state writer behind.
- The guard has to be a kernel or pipe contract rather than `Drop`. The release
  profile sets `panic = "abort"`, and a force-kill or a logoff unwinds nothing,
  so no `Drop` impl runs on the paths that leak a child.
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
- Pruning that cache removes only two shapes: a release directory staged under
  a digest other than the current one, and root-level files the bundled release
  also contains. The pre-digest layout copied the bundle straight into the cache
  root, so pruning directories alone stranded those files across every upgrade.
  A concurrent stage's temporary directory, the owner lock directory, and any
  name that is not a release digest stay.
- Start the daemon from `cua_driver_serve_args()` — `serve --embedded
  --permission-mode unrestricted --dangerously-bypass-approvals
  --parent-liveness-stdio --socket <host endpoint>` — and pass the same values
  again through `cua_driver_serve_environment()`. The driver refuses a
  contradictory pair, and the environment is what carries the contract to the
  code paths that read configuration rather than argv.
- Hold the daemon's stdin open for the life of the entry. That pipe is the
  driver's own parent-liveness contract: EOF means the host is gone, and the
  daemon shuts itself down. It is the only mechanism that works on every
  platform, so never replace it with `Stdio::null()`.
- That contract is verifiable without a packaged build: start `cua-driver serve`
  with the flags above and a piped stdin, wait for the socket, then close the
  pipe. The daemon logs `Cua Driver embedded host closed its lifetime pipe;
  shutting down.`, exits 0 within about 100 ms, and unlinks its own socket.
  A `status --socket` call against the running daemon reports
  `permission mode: unrestricted (trusted_startup_configuration)`, which is what
  confirms the embedded unrestricted launch took effect rather than being
  silently downgraded.
- Stop the daemon this process spawned on every product exit path, including
  the quit watchdog that force-exits a hung shutdown and Tauri's
  `RunEvent::Exit`, which is the only cleanup a non-primary window process
  reaches. Ask first with `cua-driver stop --socket <host endpoint>`, then drop
  the liveness pipe, then kill; never signal it by pid, which would reach an
  unrelated process.
- The endpoint has exactly one owner at a time, recorded as an exclusive lock
  on `<cache>/openagent/cua-driver/owner/daemon.lock`. Holding the lock means
  the daemon behind the endpoint is this process's; a lock held by someone else
  means a live peer's daemon, which this process must never stop; an unheld lock
  beside a listening endpoint means an orphan whose owner is gone, which is
  reclaimed with `cua-driver stop --socket` before a new daemon starts. The lock
  is also the only serialization point — without it two launching windows race,
  and the loser unlinks the winner's live socket.
- `mcp --embedded` is what keeps the reserved entry's client from starting a
  standalone Cua app of its own when the endpoint is unreachable. Dropping that
  flag reintroduces the leak the daemon's lifetime management exists to close.
- The driver's default endpoint (`\\.\pipe\cua-driver`) belongs to a
  separately installed Cua, which registers its own logon task and is not part
  of this topology. This product never stops it; a user who does not want it
  disables it with `cua-driver autostart disable`.

## Windows child-process console policy

- Create every host-spawned child with `CREATE_NO_WINDOW` (`0x0800_0000`) on
  Windows. The release host is a `windows`-subsystem process that owns no
  console, so a console-subsystem child created without the flag allocates a
  new visible terminal window beside the product window.
- The policy covers the supervised Runtime, the desktop-bootstrap helper, child
  workspace windows, `wsl.exe` probes, the Cua Driver daemon, and the
  `cua-driver stop` request sent during shutdown. Startup starts that daemon
  whenever the reserved MCP entry is enabled, and shutdown stops it on every
  exit path, so one unflagged spawn puts a terminal window in every production
  launch and every quit.
- `bun tauri dev` hides an omission because the development host already owns a
  console for the child to inherit; confirm a new spawn site in a packaged
  Windows build.

## Activation and update barrier

- Component activation must acquire the Runtime's graceful update barrier
  before replacing a Runtime, reloading product WebViews, or restarting
  the desktop shell.
- Never cancel active Agent work for an update. Defer activation when the
  bounded wait cannot drain naturally, and release the barrier after
  failure or a confirmed frontend-only reload.
- The barrier is process state, not durable state. A host process that starts
  after a previous one died mid-update holds no barrier, so its startup
  confirmation deadline rolls a selection back and re-navigates only; it must
  not release or resume anything on the way.

## Authenticated proxy and SSE bus

- Keep the supervised Runtime Bearer token in Rust. WebViews send only
  bounded `/api` method/path/body requests through the host proxy, while
  Rust attaches authentication and relays the Runtime SSE bus to existing
  Tauri event names.
- A lagged or disconnected SSE stream must stop live delivery and request
  a durable frontend resync before a new stream is started.
- Record every WebView product request the host refuses or cannot deliver as a
  warning with the method, a route label built only from the fixed Runtime
  route words, and a bounded failure class. Dynamic path segments hold
  conversation identifiers and workspace paths, and the underlying delivery
  error embeds the resolved Runtime URL, so neither the raw path nor the raw
  error belongs in the host log. This record is what separates a shell that
  never asked the Runtime for its startup snapshot from a Runtime that could
  not answer it.

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
- A selection left pending by a process that died is continued, not discarded:
  the next process verifies it, serves it, and gives it its own confirmation
  deadline. Discarding it on sight left the frontend behind the Runtime and
  shell that had already updated and re-offered the same update on every
  launch.
