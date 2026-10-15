# Native material and debug automation

## Native material

- On Windows and macOS, ordinary main and onboarding WebViews remain
  transparent over Rust-owned native material. Windows uses Mica with
  Acrylic and Blur fallbacks; macOS uses the Tauri-compatible
  `window-vibrancy` integration. Linux uses an opaque WebView inside
  its native window-manager frame.
- Main, onboarding, feature, Settings, and role-editor window canvases default
  to transparent where native material is available. General Appearance can
  disable the native background with `theme_overrides.opaque_background`; then
  the WebView paints the same theme canvas as Linux (built-in gray by default).
  A selected theme's `--bg` or a user background color also paints an opaque
  canvas, taking priority over native material. PageRuntime derives the native
  CSS class from the effective preview/saved config and resolved theme tokens;
  never force body transparency when an explicit canvas color is present.
  The Rust material can remain behind the opaque WebView. Reset, theme removal,
  and palette changes restore native transparency only when no canvas override
  or opaque preference remains. Content controls and the inset conversation stage remain
  surfaced; quick chat, browser previews, and development inspector windows
  keep their intentional separate backgrounds.
- On macOS, the frontend clips transparent Tauri window content to a 12px outer
  radius (`macos-window`) so AppKit's native rounded outline is continuous
  across the title chrome and WebView. Keep this platform class scoped to real
  Tauri windows; browser previews and non-macOS shells must remain unchanged.
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
