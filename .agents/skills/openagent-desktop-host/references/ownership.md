# Host ownership and contracts

Keep Rust host code limited to thin binary entry points, the Tauri builder,
command and event adapters, desktop capabilities, build configuration, and
packaging metadata. Ordinary frontend input goes through the shared SDK
client; do not duplicate flow selection, slash-command parsing,
configuration ownership, database operations, or runtime state machines in
the host.

## Host module composition

`lib.rs` composes Tauri plugins, managed state, and command registrations.
`diagnostics.rs` owns host tracing and forwards frontend diagnostics to the
shared authenticated Runtime operation. Runtime owns their allowlists and export;
the host must not leave frontend diagnostics in its local-only tracing subscriber.
`desktop_exit.rs` owns shell-install preparation, exit phases, bounded
child teardown, and parent-liveness monitors; quit and restart share that owner.
During quit, restart, or shell-install preparation, keep a product window visible
and publish native `desktop-exit-progress` events for Runtime, event connections,
workspace children, background tools, and final cleanup. `desktop_exit_progress`
returns the current snapshot so a mounting WebView cannot miss the initial event.
The WebView acknowledges its first painted status with `desktop_exit_presented`;
teardown waits at most 250ms, including when the WebView is unavailable.
Progress counts completed teardown attempts, including bounded failures; it is
not a time estimate or a guarantee that every child exited successfully. The
shared layout renders localized progress and makes product content inert. Native
close requests cannot hide or destroy it during teardown; a tray-only exit
reveals the main window. Hide surfaces only at final process exit, retain the
10-second quit watchdog, and keep shell-install failure/restart gates intact.
Verify with `bun run test:blackbox:desktop-exit` against isolated native fixtures.
`component_updates/` composes one update state with separate barrier, Runtime
replacement, frontend activation, resource source, and version identity adapters.
Keep rollback with its activation transaction and confirmation deadlines with
frontend selection. Moving commands between modules preserves their public IPC
names; register the defining module's native or proxy command path.
Add only these Tauri-owned adapter files to the public Rust source allowlist.

`plugin_daemons.rs` adapts the generic native daemon registry, source-refresh
release/resume handshake, and shutdown. Runtime owns authorization and package
launch resolution. The host must not choose commands, flags, endpoints, or
startup behavior by package ID.

`desktop_windows/` owns native material, foreground activity, utility geometry,
settings/role windows, startup reveal commands, and tray actions. Utility windows
remain hidden until requester-relative placement and saved geometry restoration
finish. Startup reveal and exit share one `DesktopWindowState`; window modules
must not create a separate exit or Runtime state.

`desktop_bootstrap/` adapts prepared launch inputs, the user-confirmed persistence
helper flow, instance policy, and external process startup. Public App owns
product decisions; the versioned server helper binds private storage operations.

`invoke_handlers.rs` registers the defining native and proxy adapter paths.
`runtime_proxy_commands.rs` owns the native request/event proxy entry points;
`native_commands.rs` owns OS capabilities and resolves open paths through the
supervised Runtime. `embedding_adapter.rs` discovers the packaged model seed.
`desktop_plugins.rs` preserves single-instance-first registration and separates
window-state restoration from global desktop integrations. Window startup lives
in `desktop_windows/startup.rs`; the development inspector is scheduled by its
own debug-only adapter. Arm frontend confirmation after those surfaces exist.

## Runtime and SDK roles

- Host builds link public App and protocol crates, with no private Rust source
  dependency. Use a verified `openagent-server` binary and its desktop-bootstrap JSON command
  for compatibility inspection, confirmed persistence transitions, locale, and
  launch inputs. Authorized source development builds the server separately.
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

## Package process lifecycle

Runtime owns package MCP processes and loads their launch declarations only
from validated `mcp.json`. Cua Driver uses direct embedded MCP and declares no
native daemon. Its package owns provisioning, driver flags and configuration;
the desktop has no reserved endpoint, executable substitution or launch IPC.

`PluginDaemonSupervisor` retains the separate generic native daemon boundary.
It stores one child per validated plugin ID, holds its stdin lifetime pipe,
drains diagnostics, checks a declared transport endpoint, and performs bounded
stop plus forced reaping on exit. Runtime resolves the validated launch through
the native-only authenticated `/api/desktop/plugin-daemon-launch` endpoint and
checks enablement, explicit host access and unmanaged policy. Launch data stays
in Rust; the WebView cannot access that endpoint.

Before package uninstall, update, or source activation, stop the host-owned
daemon and await bounded shutdown so Windows package files are released. Source
refresh resumes only the daemon this host released, using the new validated
descriptor; removing the declaration leaves it stopped. Stop owned daemons on
all product exit paths, including the quit watchdog and Tauri `RunEvent::Exit`.
Keep generic daemon supervision independent of any package's MCP topology.

## Windows child-process console policy

- Decode `wsl.exe` output in the host adapter. An even-length buffer with a
  zero high byte in at least one two-byte pair is UTF-16LE; remove its leading
  BOM after decoding. Other output uses lossy UTF-8 with NUL bytes removed.
- Create every host-spawned child with `CREATE_NO_WINDOW` (`0x0800_0000`) on
  Windows. The release host is a `windows`-subsystem process that owns no
  console, so a console-subsystem child created without the flag allocates a
  new visible terminal window beside the product window.
- The policy covers the supervised Runtime, desktop-bootstrap helper,
  workspace windows, `wsl.exe` probes and generic native plugin daemons.
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
- Bound each SSE frame to 32 MiB, including incomplete frames, independently
  of HTTP chunk boundaries. This accommodates the MCP Apps 4 MiB resource
  limit plus JSON escaping and the event envelope. A legal large resource must
  reach the live transcript before terminal checkpoint hydration; verify with
  `bun run test:blackbox:mcp-ui-streaming` against the real Mermaid package.
- Record every WebView product request the host refuses or cannot deliver as a
  warning with the method, a route label built only from the fixed Runtime
  route words, and a bounded failure class. Dynamic path segments hold
  conversation identifiers and workspace paths, and the underlying delivery
  error embeds the resolved Runtime URL, so neither the raw path nor the raw
  error belongs in the host log. This record is what separates a shell that
  never asked the Runtime for its startup snapshot from a Runtime that could
  not answer it.

## Asset protocols and native opener

- Rewrite Runtime media asset URLs to the host-owned `openagent-runtime`
  protocol. Permit only GET/HEAD requests for bounded media asset paths,
  preserve byte-range response headers, and attach the process token only in
  Rust.
- Resolve workspace paths through the supervised Runtime before the host
  invokes the native opener. Debug and release use the same authenticated proxy.
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
Public App owns persistence consent policy; the server binds private storage
maintenance and performs semantic embedding validation.

## Bundled terminal commands

The host resolves `terminal-tools/` during Tauri setup and requires `rg`, `fd`,
and `bat` before starting the supervised Runtime. Debug builds may use
prepared resources beneath the manifest directory; missing production resources
require repair/reinstallation. `terminal_tools.rs` prepends the directory to each
Runtime child command's PATH, including bootstrap inspection, replacement, and
rollback, while preserving inherited entries and the bundled Node.js directory.
The Runtime's local shells inherit these commands without loading shell profiles.
Do not mutate the threaded host's environment or the user's persistent PATH.
Windows resources do not provision tools inside WSL, containers, or SSH hosts;
the terminal-file-tools skill still handles those separate execution environments.
Qualify with `cargo test --manifest-path src-tauri/Cargo.toml terminal_tools::tests`
after `bun scripts/prepare-terminal-tools.mjs`: the real shell must search, find,
and read a fixture file with no system tool installations in its PATH.

## Bundled plugin interpreter

The thin host resolves its shell-owned `node-runtime/` resource in Tauri setup
before starting the supervised Runtime or plugin daemons. Pass the interpreter
directory through child command environments, including Runtime replacement and
rollback. Host-supervised `node` launchers resolve to the bundled executable.
Never change process-global environment after threads start or install Node into
the user's OS. Release resource absence is a repair/reinstall failure; debug
builds may resolve the prepared resource under their manifest directory.
Qualify interpreter lookup and child inheritance with a PATH containing no system
Node, and run the real desktop plugin installation/host-access scenario.
