---
name: openagent-desktop-host
description: Preserve OpenAgent's thin Tauri host and native desktop behavior. Use for src-tauri changes, native windows or materials, single-instance handling, Tauri IPC and events, startup integration, or native-shell verification.
metadata:
  category: desktop-development
---

# OpenAgent desktop host

Keep `src-tauri` a product adapter over the private SDK, not a second runtime.
Read `sdk/AGENTS.md` before changing the SDK side of any boundary.
Do not load replaceable Rust dynamic libraries. Runtime extraction uses a
verified, supervised process with a versioned transport contract, fallback
binary, and exclusive durable-state ownership.

## Ownership

- Use `openagent-app` only for product bootstrap and `openagent-runtime` for
  execution APIs.
- Keep Rust host code limited to thin binary entry points, Tauri builder,
  command and event adapters, desktop capabilities, build configuration, and
  packaging metadata.
- Ordinary frontend input goes through the shared SDK client. Do not duplicate
  flow selection, slash-command parsing, configuration ownership, database
  operations, or runtime state machines in the host.
- Change IPC contracts atomically across the SDK contract or adapter, public
  frontend types, and every caller.
- A replaceable Runtime supervisor must accept only compatible loopback
  readiness records, authenticate health probes with a process-scoped token,
  stop the old child through its private control pipe before starting a
  candidate, and restart the previous verified launch on failure. Release
  desktop startup must use that supervised process as the only durable-state
  Runtime; the packaged server is a fallback binary, not a concurrent writer.
- Keep the supervised Runtime Bearer token in Rust. WebViews send only bounded
  `/api` method/path/body requests through the host proxy, while Rust attaches
  authentication and relays the Runtime SSE bus to existing Tauri event names.
  A lagged or disconnected SSE stream must stop live delivery and request a
  durable frontend resync before a new stream is started.
- Rewrite Runtime media and HTML asset URLs to the host-owned
  `openagent-runtime` protocol. Permit only GET/HEAD requests for bounded media
  and HTML asset paths, preserve byte-range response headers, and attach the
  process token only in Rust. Resolve workspace paths in the Runtime before the
  host invokes the native opener.
- Serve replaceable frontend versions only through the host-owned
  `openagent-ui` protocol. Activation must atomically retain the previous
  selection, reload every product WebView with the candidate version, require
  a mounted-frontend confirmation, and fall back to the embedded frontend when
  no verified previous selection exists.

## Startup and windows

- Register single-instance enforcement as the first Tauri plugin for ordinary
  primary launches. A repeated launch restores, shows, and focuses the existing
  main window. If the setup window is currently visible for first-run
  configuration or embedding-resource repair, restore that instead; its pre-
  created but hidden WebView stays closed only when configuration and the local
  resource are both ready.
- Exclude headless agent-server and SDK-owned
  `--openagent-workspace-window` processes from that guard; dedicated workspace
  processes are part of the multi-workspace contract.
- File -> New window launches an independent copy of the current workspace
  immediately. Keep that explicit duplicate detached from the SDK's registered
  workspace route so targeted navigation continues to focus the canonical
  workspace process.
- Reveal a dedicated workspace window's main shell as soon as Tauri setup owns
  the runtime host. Let the frontend's layout-stable loading state remain
  visible while startup bootstrap restores durable conversation data.
- Tauri's synchronous `setup` callback is not a Tokio worker. Enter
  `tauri::async_runtime` before SDK lifecycle calls that spawn Tokio tasks.
- Run SDK-owned persisted-data compatibility inspection before runtime and
  WebView construction. The desktop may collect native confirmation, but the
  host must not duplicate inspection, backup, reset, or migration operations.
- Pre-create the centered onboarding window at its fixed 960 × 640px product
  geometry. Keep it non-resizable and non-maximizable so every setup step uses
  the same verified canvas while dense form content scrolls inside the WebView.
- On Windows, determine completion-notification activity by resolving the
  foreground and Tauri HWNDs through `GA_ROOTOWNER`, with current-process
  ownership as the native-dialog fallback. Do not require exact HWND equality:
  WebView2 may activate a child HWND, including one hosted by its subprocess,
  while the product window is visibly foreground. Other platforms retain
  Tauri's native window-focus query.

## Native material

Ordinary main and onboarding WebViews remain transparent over Rust-owned native
material. Windows uses Mica with Acrylic and Blur fallbacks; macOS uses the
Tauri-compatible `window-vibrancy` integration. Main, onboarding, feature, and
conversation canvases share a 30%-opaque theme tint. Content controls remain
surfaced; quick chat, browser previews, and development inspector windows keep
their intentional separate backgrounds. Serialize native theme requests and,
when returning to the system theme, clear the native override before resolving
the WebView media preference so both layers use the same palette. Treat
`docs/design.md` as the visual source of truth.

## Debug automation

Keep `tauri-plugin-pilot` registered after the single-instance plugin. Its
named-pipe bridge and injected WebView instrumentation are available by default
in debug builds for native-shell verification; the plugin remains a no-op in
release builds. Retain `pilot:default` only on the existing desktop capability
that covers application-owned windows.

## Verification routing

For behavior involving the real shell, native material, OS theme, title bar,
focus, or window geometry, read and follow
[references/native-verification.md](references/native-verification.md).
If the behavior is completely reproducible in a browser, use the workspace
`playwright` skill instead.
