# Startup and window management

## Single instance and focus routing

- Register single-instance enforcement as the first Tauri plugin for
  ordinary primary launches. A repeated launch restores, shows, and
  focuses the existing main window.
- If the setup window is currently visible for first-run configuration or
  embedding-resource repair, restore that instead; its pre-created but
  hidden WebView stays closed only when configuration and the local
  resource are both ready.
- After any successful programmatic `set_focus`, including repeated
  launch and registered-workspace navigation, emit
  `desktop-window-activated` to the target WebView because Windows may
  not deliver a distinct focus-changed callback. The main WebView
  consumes both signals as new composer-focus requests, including
  activation events that arrive without a preceding blur callback.

## Pilot plugin and upstream pin

- `tauri-plugin-pilot` enables Tauri's unstable multi-WebView path, so
  Windows native-shell dependencies must retain the upstream fix for
  tauri-apps/tauri#15624: when the top-level window regains focus
  through Alt+Tab, Tauri restores the last focused WebView through its
  WebView2 controller. Keep the merged upstream revision pinned until a
  stable Tauri release includes that fix.
- Do not replace it with an application-level delayed `SetFocus`
  callback; the runtime must update its focused WebView through the
  WebView2 controller.
- Apply that same focus-routing rule to any focus-changed handling on
  other platforms.

## Async runtime and data inspection

- Tauri's synchronous `setup` callback is not a Tokio worker. Enter
  `tauri::async_runtime` before SDK lifecycle calls that spawn Tokio
  tasks.
- Run SDK-owned persisted-data compatibility inspection before runtime
  and WebView construction. The desktop may collect native confirmation,
  but the host must not duplicate inspection, backup, reset, or
  migration operations.

## Workspace and on-demand utility windows

- Reveal a dedicated workspace window's main shell as soon as Tauri
  setup owns the runtime host. Let the frontend's layout-stable loading
  state remain visible while startup bootstrap restores durable
  conversation data.
- Create Settings management windows on demand with fixed domain labels,
  including General Settings.
  Each domain is a modeless singleton: repeated application-menu
  requests select the requested section, restore the existing window,
  and focus it instead of constructing another WebView. Window
  construction remains a native host responsibility; each Settings
  WebView reloads and saves configuration through the shared SDK
  contract. Dispatch on-demand WebView construction through an async Tauri
  command so Windows WebView2 initialization cannot block its own UI thread.
- Give each Settings domain a compact content-appropriate initial geometry.
  After the WebView renders, fit the native window to the active section's
  measured content, including localized and dynamically added rows. Bound the
  result to the current monitor work area and keep excess content scrolling
  inside the settings pane; center only the initial fitted size so later
  section changes do not discard a user-moved window position.
- Create the role editor on demand as one modeless singleton utility window.
  Repeated create or edit requests retarget, restore, and focus the existing
  WebView. The editor owns role/resource loading and writes through the shared
  SDK contract, then broadcasts a role-list refresh while identifying the
  requesting workspace window for selection changes.

## Platform window conventions

- Pre-create the centered onboarding window at its fixed 960 × 640px
  product geometry. Keep it non-resizable and non-maximizable so every
  setup step uses the same verified canvas while dense form content
  scrolls inside the WebView.
- Keep the frameless onboarding WebView draggable through its dedicated top
  drag region; leave the form and navigation content below that region so
  controls remain ordinary non-dragging interactions.
- Create the Linux main window as an opaque, natively decorated window
  so the compositor, including WSLg, owns its outer frame and resize
  edge. Keep custom window controls out of the Linux WebView; Windows
  and macOS retain the frameless product chrome and platform-specific
  controls.
- On Windows, expose the frameless main title bar through WebView2's native
  drag region and mark menus and window controls as non-drag regions. Do not
  replace native title-bar gestures with a JavaScript `start_dragging` call:
  its mouse-down timing races double-click maximize and can restore only part
  of the previous window geometry.
- On Windows, determine completion-notification activity by resolving
  the foreground and Tauri HWNDs through `GA_ROOTOWNER`, with
  current-process ownership as the native-dialog fallback. Do not
  require exact HWND equality: WebView2 may activate a child HWND,
  including one hosted by its subprocess, while the product window is
  visibly foreground. Other platforms retain Tauri's native window-focus
  query.

## Runtime navigation context

- A supervised external Runtime receives the host process's exact
  workspace navigation context: optional conversation ID, optional
  message ID, and the explicit-new-conversation flag. Preserve those
  fields across Runtime resource reload and rollback.
- The host must not broaden the Runtime's startup workspace
  authorization to make cross-workspace navigation succeed.
- Tray and window lifecycle handlers must not retain the host or leave
  desktop and server processes alive.
