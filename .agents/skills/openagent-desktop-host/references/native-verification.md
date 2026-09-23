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
