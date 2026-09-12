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

## Automation top-bar black-box coverage

The committed `tests/blackbox/automation-*.toml` scenarios drive the real
Automation utility window through `tauri-pilot`. Run them through the repository
wrapper so the lifecycle Hook editor, all six scheduled-hook modes, menu entries,
shortcuts, cleanup actions, and locale/theme states are covered together:

```bash
OPENAGENT_HOME=/tmp/openagent-blackbox-fixture \
TAURI_PILOT_SOCKET=/run/user/1000/tauri-pilot-<instance>.sock \
bun run test:blackbox:automation
```

Start the debug app with the same isolated `OPENAGENT_HOME` and keep the
resulting screenshots in a temporary directory via `BLACKBOX_ARTIFACT_DIR`.
The wrapper refuses the installed `~/.openagent` data directory and restores
the general theme and language after visual checks.
