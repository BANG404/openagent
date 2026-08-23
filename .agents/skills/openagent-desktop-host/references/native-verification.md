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

Tauri-pilot instrumentation is debug-only. If it is not already shipped, add it
only for investigation and remove its dependency, plugin initialization, and
capability before delivery unless the task explicitly requests a persistent
test hook.

Use browser verification only when native-window state is outside the
acceptance criteria. Do not substitute another browser control surface for the
workspace `playwright` skill, and do not create repository-root artifact
directories.
