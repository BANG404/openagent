---
name: openagent-desktop-host
description: Preserve OpenAgent's thin Tauri host and native desktop behavior. Use for src-tauri changes, native windows or materials, single-instance handling, Tauri IPC and events, startup integration, or native-shell verification.
metadata:
  category: desktop-development
---

# OpenAgent desktop host

Keep `src-tauri` a product adapter over the private SDK, not a second runtime.
Read `sdk/AGENTS.md` before changing the SDK side of any boundary.

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

## Startup and windows

- Register single-instance enforcement as the first Tauri plugin for ordinary
  primary launches. A repeated launch restores, shows, and focuses the existing
  main window.
- Exclude headless agent-server and SDK-owned
  `--openagent-workspace-window` processes from that guard; dedicated workspace
  processes are part of the multi-workspace contract.
- Tauri's synchronous `setup` callback is not a Tokio worker. Enter
  `tauri::async_runtime` before SDK lifecycle calls that spawn Tokio tasks.
- Run SDK-owned persisted-data compatibility inspection before runtime and
  WebView construction. The desktop may collect native confirmation, but the
  host must not duplicate inspection, backup, reset, or migration operations.
- Pre-create the centered onboarding window at its fixed 960 × 640px product
  geometry. Keep it non-resizable and non-maximizable so every setup step uses
  the same verified canvas while dense form content scrolls inside the WebView.

## Native material

Ordinary main and onboarding WebViews remain transparent over Rust-owned native
material. Windows uses Mica with Acrylic and Blur fallbacks; macOS uses the
Tauri-compatible `window-vibrancy` integration. Main, onboarding, feature, and
conversation canvases share a 30%-opaque theme tint. Content controls remain
surfaced; quick chat, browser previews, and development inspector windows keep
their intentional separate backgrounds. Treat `docs/design.md` as the visual
source of truth.

## Verification routing

For behavior involving the real shell, native material, OS theme, title bar,
focus, or window geometry, read and follow
[references/native-verification.md](references/native-verification.md).
If the behavior is completely reproducible in a browser, use the workspace
`playwright` skill instead.
