# Native material and debug automation

## Native material

- On Windows and macOS, ordinary main and onboarding WebViews remain
  transparent over Rust-owned native material. Windows uses Mica with
  Acrylic and Blur fallbacks; macOS uses the Tauri-compatible
  `window-vibrancy` integration. Linux uses an opaque WebView inside
  its native window-manager frame.
- Main, onboarding, feature, Settings, and role-editor window canvases remain
  fully transparent where native material is available; do not overlay a
  theme-color tint. Content controls and the inset conversation stage remain
  surfaced; quick chat, browser previews, and development inspector windows
  keep their intentional separate backgrounds.
- Serialize native theme requests and, when returning to the system
  theme, clear the native override before resolving the WebView media
  preference so both layers use the same palette. Treat
  `openagent-design-system` as the visual source of truth.

## Debug automation

- Ordinary `bun tauri dev` startup must use the prepared debug
  `openagent-server` through the same supervisor, authenticated proxy,
  Runtime asset protocol, and SSE resync path as release startup.
- Keep embedded Runtime composition behind the explicit
  `bun run tauri:dev:embedded` diagnostic command; that command alone
  enables the `embedded-runtime` Cargo feature. Keep the feature
  disabled by default so ordinary debug and release shell binaries do
  not retain the embedded Runtime bootstrap or product command adapter
  in their linked image.
- Make external startup failure visible instead of selecting it
  automatically. Both modes use the isolated development data root
  unless `OPENAGENT_HOME` explicitly selects a task fixture.
- Keep `tauri-plugin-pilot` registered after the single-instance plugin.
  Its named-pipe bridge and injected WebView instrumentation are
  available by default in debug builds for native-shell verification;
  the plugin remains a no-op in release builds. Retain `pilot:default`
  only on the existing desktop capability that covers
  application-owned windows.
