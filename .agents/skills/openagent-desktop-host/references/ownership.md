# Host ownership and contracts

Keep Rust host code limited to thin binary entry points, the Tauri builder,
command and event adapters, desktop capabilities, build configuration, and
packaging metadata. Ordinary frontend input goes through the shared SDK
client; do not duplicate flow selection, slash-command parsing,
configuration ownership, database operations, or runtime state machines in
the host.

## Host module composition

`lib.rs` composes Tauri plugins, managed state, and command registrations.
`diagnostics.rs` owns host tracing and the allowlists for frontend-originated
records. `desktop_exit.rs` owns shell-install preparation, exit phases, bounded
child teardown, and parent-liveness monitors; quit and restart share that owner.
`component_updates/` composes one update state with separate barrier, Runtime
replacement, frontend activation, resource source, and version identity adapters.
Keep rollback with its activation transaction and confirmation deadlines with
frontend selection. Moving commands between modules preserves their public IPC
names; register the defining module's command path in both Runtime modes.
Add only these Tauri-owned adapter files to the public Rust source allowlist.

`cua_driver/` owns the installed daemon's native adapter. `policy.rs` derives
the private endpoint and host-owned argument/environment tail; `ownership.rs`
decides whether to serve, reclaim an orphan, adopt, or await a live peer from
the endpoint lock. The module composes provisioning and the shared plugin
daemon supervisor. SDK authorization and package launch resolution remain in
the Runtime; the adapter does not reinterpret package commands.

`desktop_windows/` owns native material, foreground activity, utility geometry,
settings/role windows, startup reveal commands, and tray actions. Utility windows
remain hidden until requester-relative placement and saved geometry restoration
finish. Startup reveal and exit share one `DesktopWindowState`; window modules
must not create a separate exit or Runtime state.

`desktop_bootstrap/` separates Runtime mode selection, the user-confirmed
persistence helper flow, instance policy, and external process startup.
The versioned helper still owns data inspection and transitions in the SDK.
`embedded_commands/` contains only typed forwarding adapters, grouped by
product domain and compiled only for explicit embedded diagnostics. Keep
command argument shapes aligned with the SDK contract and register their
defining module paths without changing public operation names.

`invoke_handlers.rs` registers the defining adapter paths for each Runtime mode.
`runtime_proxy_commands.rs` owns the native request/event proxy entry points;
`native_commands.rs` owns OS capabilities and resolves open paths through the
active Runtime. `embedding_adapter.rs` discovers the packaged model seed and
forwards explicit diagnostic commands, while `embedded_host.rs` implements the
SDK host bridge only when embedded diagnostics are enabled.
`desktop_plugins.rs` preserves single-instance-first registration and separates
window-state restoration from global desktop integrations. Window startup lives
in `desktop_windows/startup.rs`; the development inspector is scheduled by its
own debug-only adapter. Arm frontend confirmation after those surfaces exist.

## Runtime and SDK roles

- Ordinary host builds must not link private SDK Rust crates. Compile and stage
  `openagent-server` first, then use its versioned desktop-bootstrap JSON command
  for compatibility inspection, confirmed persistence transitions, locale, and
  launch inputs. Private Rust dependencies resolve only in the generated SDK-owned embedded
  diagnostic manifest, never as optional dependencies of the public host.
- The supervised desktop server exposes the typed product `/api/desktop/*`
  router through `--desktop-api`. The server remains the one Runtime process;
  do not introduce an embedded or parallel agent Runtime in the desktop host.
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

## Plugin-owned Cua Driver daemon

Long-lived plugin processes use the host's `PluginDaemonSupervisor` registry.
It stores one managed child per validated plugin ID, holds the stdin lifetime
pipe and adapter resources, drains diagnostics, waits for socket readiness when
a transport declares an endpoint, and performs bounded stop plus forced
reaping on exit. Cua Driver uses this same registry; its adapter keeps only the
reserved endpoint ownership lock, provisioning step, unrestricted policy, and
command-line policy tail. A daemon with a managed process policy must go
through a sandbox-aware host adapter; it is rejected rather than started with
ambient permissions.

- The Cua Driver package is subscribed and updated from
  `https://github.com/BANG404/openagent-cua-driver` through the normal Agent
  Plugin updater. The desktop bundle does not contain a Cua binary or resource
  downloader.
- The host resolves the package's validated `extensions.openagent.daemon`
  descriptor and supervises that command. Package updates are installed into a
  versioned plugin directory before activation.

### Daemon lifecycle

- Before forwarding a package uninstall or update, stop its host-owned daemon
  and await the supervisor's bounded shutdown. Apply this in both the supervised
  product proxy and embedded command adapter; an active daemon may hold the
  package directory open on Windows even after Runtime has stopped its MCP client.
- The supervised desktop resolves Cua's launch through the native-only,
  Bearer-authenticated `/api/desktop/plugin-daemon-launch` endpoint. Runtime checks
  the installed manifest, enablement and explicit host-access grant. The launch
  environment stays in native Rust; WebView proxy requests to this endpoint are
  rejected. Embedded diagnostics use the same Runtime resolver. Persist a new
  grant before requesting launch, and reconnect the reserved MCP client after
  a fresh daemon start. Revoking host access or disabling Cua stops the daemon.

- Start the daemon from the verified installed plugin directory; never replace
  files in the active directory while the daemon is running.
- The kernel resolves the launch — the program it runs, and the `serve
--embedded` the package declares — and the host appends only the policy tail
  it owns through `cua_driver_launch_args()`: `--permission-mode unrestricted
--dangerously-bypass-approvals --parent-liveness-stdio --socket <host
endpoint>`. Pass the same values again through
  `cua_driver_serve_environment()`. The driver refuses a contradictory pair, and
  the environment is what carries the contract to the code paths that read
  configuration rather than argv. Never rebuild the leading arguments in the
  host: interpreting the launch twice is how `node` gets started as if it were
  the package's launcher file.
- The launcher fetches the driver it runs into the package's own writable
  directory on first use, so every invocation — provisioning, serving, stopping
  — carries `PLUGIN_DATA` from the resolved descriptor and runs with the package
  root as its working directory. That is why a package that ships a launcher and
  no driver still needs no write access to the package it was loaded from.
- The launcher's `--openagent-prepare` mode fetches and verifies the driver and
  exits without starting anything, under its own long budget, so the daemon's
  startup timeout never pays for a download. Provisioning happens before the
  serve call, never in the middle of the wait for the endpoint to listen.
- Hold the daemon's stdin open for the life of the entry. That pipe is the
  driver's own parent-liveness contract: EOF means the host is gone, and the
  daemon shuts itself down. It is the only mechanism that works on every
  platform, so never replace it with `Stdio::null()`.
- That contract is verifiable without a packaged build: run the installed
  package's launcher with `serve --embedded` and the flags above, a piped stdin,
  and `PLUGIN_DATA` pointing at a writable empty directory, wait for the socket,
  then close the pipe. The daemon logs `Cua Driver embedded host closed its lifetime pipe; shutting down.`, exits 0 within about 100 ms, and unlinks its own socket.
  A `status --socket` call against the running daemon reports
  `permission mode: unrestricted (trusted_startup_configuration)`, which is what
  confirms the embedded unrestricted launch took effect rather than being
  silently downgraded.
- Stop the daemon this process spawned on every product exit path, including
  the quit watchdog that force-exits a hung shutdown and Tauri's
  `RunEvent::Exit`, which is the only cleanup a non-primary window process
  reaches. Ask first through the same package launcher with the driver's `stop
--socket <host endpoint>` subcommand, then drop the liveness pipe, then kill;
  never signal it by pid, which would reach an unrelated process.
- The endpoint has exactly one owner at a time, recorded as an exclusive lock
  on `<cache>/openagent/cua-driver/owner/daemon.lock`. Holding the lock means
  the daemon behind the endpoint is this process's; a lock held by someone else
  means a live peer's daemon, which this process must never stop; an unheld lock
  beside a listening endpoint means an orphan whose owner is gone, which is
  reclaimed with the launcher's `stop --socket` before a new daemon starts. The lock
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

- Decode `wsl.exe` output in the host adapter. An even-length buffer with a
  zero high byte in at least one two-byte pair is UTF-16LE; remove its leading
  BOM after decoding. Other output uses lossy UTF-8 with NUL bytes removed.
- Create every host-spawned child with `CREATE_NO_WINDOW` (`0x0800_0000`) on
  Windows. The release host is a `windows`-subsystem process that owns no
  console, so a console-subsystem child created without the flag allocates a
  new visible terminal window beside the product window.
- The policy covers the supervised Runtime, the desktop-bootstrap helper, child
  workspace windows, `wsl.exe` probes, the Cua Driver daemon, and the
  launcher's `stop` request sent during shutdown. Startup starts that daemon
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

- The installed Cua Driver plugin daemon must be resolved before any Runtime
  bootstrap in development mode, because the embedded diagnostic can initialize
  MCP connections before Tauri `setup`.
- Rewrite Runtime media asset URLs to the host-owned `openagent-runtime`
  protocol. Permit only GET/HEAD requests for bounded media asset paths,
  preserve byte-range response headers, and attach the process token only in
  Rust.
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


The normal release shell creates its window before Runtime persistence inspection.
The independent bootstrap and `desktop_bootstrap/provisioning.rs` recover missing
or failed resource installation without SDK frontend or Runtime availability.
Native managers still verify signatures and their own compatibility boundaries;
Runtime still owns persistence consent and semantic embedding validation.
