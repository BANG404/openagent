# Native desktop verification

Use `tauri-pilot` to drive the debug application and inspect its DOM and runtime
logs. On Windows, pair it with an Appium server and the UI
Automation-compatible DesktopDriver to attach to the exact application window,
inspect the native tree, handle, and bounds, and capture native before-and-after
screenshots.

- Use an isolated temporary `OPENAGENT_HOME`.
- Identify the target process and window explicitly.
- Keep automatically generated artifacts in the system temporary directory.
- Capture light and dark themes and Chinese and English copy for visible native
  changes.

Tauri-pilot instrumentation is an intentional debug-only dependency. Keep its
plugin initialization and capability in place after verification; its server
and injected bridge are compiled out of release builds.

Use browser verification only when native-window state is outside the
acceptance criteria. Do not substitute another browser control surface for the
workspace `playwright` skill, and do not create repository-root artifact
directories.

## Module-level acceptance

For every changed user-facing module or native interaction, run a committed
`tauri-pilot` black-box scenario against the real debug Tauri window and assert
the expected user-visible result. Select the scenario and command for the
changed module; testing a neighboring module does not cover it. If no scenario
and command exist yet, add them under `tests/blackbox/` and `scripts/`, expose a
`test:blackbox:<module>` package command, and run that command before handoff.
Use isolated application data and deterministic fixtures, and include the
failure or recovery behavior affected by the change. Unit tests, browser
previews, Rust checks, and screenshots can supplement this run but do not
replace it for user-facing Tauri behavior.

Start the matching debug application with the same isolated
`OPENAGENT_HOME` and development instance expected by the module runner. Keep
the runner's DOM assertions and cleanup in the script; the scenario should
drive the same controls a user uses. Record the exact command and result in the
handoff. If the changed behavior is not user-facing and has no native
interaction, use its owning contract or integration tests instead.

## Automation top-bar black-box coverage

The committed `tests/blackbox/automation-*.toml` scenarios drive the real
Automation surface inside the main window through `tauri-pilot`; the wrapper
opens it with the same top-bar shortcuts the product uses and never constructs a
utility window. Run them through the repository wrapper so the lifecycle Hook
editor, all six scheduled-hook modes, menu entries, shortcuts, cleanup actions,
and locale/theme states are covered together:

```bash
bun tauri dev --multi-instance blackbox
bun run test:blackbox:automation
```

The app and wrapper share `~/.openagent-dev/instances/blackbox`, so provider and
model setup survives reruns. Set `OPENAGENT_HOME` once when a separate fixture
is required; both commands must receive the same value. On Linux, visual cases
capture the native window through `screenshot_native` because WebView capture
does not contain the composited Tauri surface. Set `BLACKBOX_SCREENSHOT_MODE=webview`
only when testing WebView pixels explicitly.

Start the debug app with the same isolated `OPENAGENT_HOME` and keep the
resulting screenshots in a temporary directory via `BLACKBOX_ARTIFACT_DIR`.
The wrapper refuses the installed `~/.openagent` data directory and restores
the general theme and language after visual checks.

The Automation surface treats its requested section as an initial selection,
not a permanent controlled value. User tab changes must survive asynchronous
role or hook refreshes; the black-box suite covers durable persistence by
reloading the whole main window, reopening Automation, and only then asserting
that the saved hook returned and creating a scheduled hook.

## Agent plugin sidebar coverage

The committed `tests/blackbox/plugin-sidebar.toml` scenario drives the demo
Agent Plugin in the main window. It verifies the declared sidebar iframe,
versioned conversation and branch context, and that the conversation surface
stays mounted beside the plugin. The wrapper copies the deterministic fixture
into the isolated plugin directory before running the scenario and checks the
window error log afterward:

```bash
bun tauri dev --multi-instance plugin-blackbox
bun run test:blackbox:plugins
```

## Agent plugin process coverage

The committed `tests/blackbox/plugin-process.toml` scenario drives the processes
a package declares. The fixture under `tests/fixtures/agent-plugin-process`
declares an `mcp.json` server, a portable command, and a daemon at once, and the
scenario raises the instance to the managed, network-enabled profile on the way
in and restores the restricted tier on the way out. It shares the instance
reserved for plugin verification, which the wrapper picks because the scenario
changes the permission profile:

```bash
bun tauri dev --multi-instance plugin-blackbox
bun run test:blackbox:plugin-process
```

The instance has to run a workspace that does not contain the app's own build
tree. The managed Windows backend launches its wrapper by path and refuses to do
so when a profile write rule covers the executable, so an instance whose
workspace is the user's home cannot confine a plugin process at all; both the
command and the MCP server fail, and that refusal is the symptom to read. The
wrapper therefore refuses to start unless `workspace` in the instance's
`config.toml` is the instance's own `workspace` directory, and it reports the
refusal by name if the fixture's server still never connects. The workspace is
read once at startup and the settings surface rewrites the whole file on save, so
change it with the instance stopped and start it again.

Whether the child was contained is not asserted here; the Runtime's confinement
test owns that, where the workspace and the package root can be chosen
independently. The wrapper asserts only what a host can observe: the scenario
steps against the card, the composer, and the permission controls; the Runtime
log delta carrying the fixture command's own failure, which the desktop run path
reports to the log rather than to the conversation; the handshake report the
fixture's MCP server writes into its own data directory after `tools/list`; the
restored configuration; and the window's error log, ignoring entries older than
the run, because a dev build logs its own bootstrap failure for the Cua driver
daemon before any runner reaches it.

The run ends with the fixture package disabled, which is the state the scenario
restores. The wrapper unmounts the package through the same switch before
replacing the installed copy: a mounted package's server holds the package
directory as its working directory, and Windows will not delete a directory a
live process is sitting in.

## Chat-group sidebar coverage

The committed `tests/blackbox/chat-group-sidebar.toml` scenario verifies that a
durable chat-group tool round makes the right-sidebar chat-group view available
and renders the recorded group. It needs no provider run: the wrapper seeds the
conversation first by calling the isolated debug instance's loopback dev API
(`POST /v1/diagnostics/chat-group-conversation`), which registers a real group
through the product tool and writes one renderable checkpoint. The scenario then
drives the same conversation list and sidebar tabs a user uses:

```bash
OPENAGENT_HOME="$HOME/.openagent-dev/instances/blackbox" bun tauri dev
bun run test:blackbox:chat-groups
```

The app and the wrapper must share the isolated `OPENAGENT_HOME`/instance; the
wrapper reads `dev-api.json` from that home and fails with a clear message when
the instance is not running. Keep the seeded conversation out of release state;
the diagnostic route exists only in the debug dev API.

This section and the MCP Apps section below are the two runners that seed
through the dev API, and they are the two that must not use
`--multi-instance <name>`. The host only passes `--desktop-primary` to the
Runtime when it is not an agent server, not a workspace window, and not a
development multi-instance, and `start_dev_api` (which writes `dev-api.json`)
runs behind that argument, so a multi-instance run never publishes the manifest
the wrapper needs. Set the isolated `OPENAGENT_HOME` explicitly instead, as
above; that mode restores ordinary single-instance enforcement, so stop any
other running window of the same build first.

## MCP Apps coverage

The committed `tests/blackbox/mcp-apps.toml` and `mcp-apps-teardown.toml`
scenarios verify the MCP Apps host bridge against the real, dependency-free MCP
stdio server in `tests/fixtures/mcp-app-demo/`. The wrapper copies that fixture
into the isolated home first, then seeds a conversation through the loopback dev
API (`POST /v1/diagnostics/mcp-app-conversation`). The runtime connects the
fixture over stdio, reads its `ui://` resource, and emits the same
`chat-tool-call`/`chat-tool-result` events a provider round would, so the run
needs no provider and no committed database fixture:

```bash
OPENAGENT_HOME="$HOME/.openagent-dev/instances/blackbox" bun tauri dev
bun run test:blackbox:mcp-apps
```

Like the chat-group runner, this one seeds through the dev API and so cannot use
`--multi-instance`; see that section for why.

The host mounts MCP Apps in a `sandbox="allow-scripts"` iframe, so the parent
window has no `contentDocument` and cannot assert on widget internals. Every
assertion is therefore a host-observable signal. The fixture widget encodes its
status into the intrinsic height it reports through
`openai.notifyIntrinsicHeight`, which the host applies to the `.mcp-app-frame`
section as an inline style:

- `560px` — handshake plus the app-only tool round trip plus the
  `uploadFile`/`getFileDownloadUrl` round trip, light theme.
- `600px` — the same successful run after the host switched to the dark theme.

A regression in the `ui/*` bridge, the `window.openai` compatibility layer, the
app-only tool dispatch boundary, or file flow moves the frame off those heights
instead of silently passing. Keep the encoding contract, the widget, and this
list aligned when either changes.

The wrapper drives the same Appearance controls a user uses, so the run also
covers the theme and language boundaries: the frame height must follow the dark
theme and the frame must carry the host locale for the active language.
Teardown is covered twice, because the two paths have different owners. The
close-marked conversation passes `close: true` through the tool arguments so the
widget exercises the app-initiated `ui/request-close` path, which must hide the
frame; and because the close-marked conversation is opened second, the frame
count asserts that switching the active conversation unmounts the previous
conversation's app frame instead of leaking it into the new transcript. That
close-marked run is also the only step that proves the host delivers the tool
arguments, because it is the only widget behavior that reads
`openai.toolInput`; the light-theme run passes on the widget-initiated request
paths alone.

Two failures in the injected bridge are silent — the widget simply renders at
its default height and reports nothing — so keep both invariants when editing
`McpAppFrame.svelte`. The bridge script's closing tag must reach the WebView
without a backslash, or the injected script element never terminates and
`window.openai` is never defined; build the tag by concatenation so the literal
`</script>` stays out of the Svelte source. And every host-to-widget message
must be structured-clonable, so snapshot `$state` values before `postMessage`;
a state proxy throws `DataCloneError`, which the frame sees as a message that
was never sent.
