# IPC and events

- Keep ordinary debug and release desktop product operations on the same shared
  SDK selection path: both use the supervised external Runtime transport, while
  the explicit embedded diagnostic mode maps the same finite operations to Tauri
  commands. Development Inspector Runtime operations belong to that finite map
  and remain confined to their Inspector surfaces; native onboarding and window
  controls stay local to Tauri.
- Route replaceable Runtime behavior through the shared SDK client. Keep direct
  literal Tauri `invoke()` calls limited to commands classified by
  `tests/runtimeCommandBoundary.test.js` as product operations or explicit
  native/local capabilities; new unclassified commands must fail that audit.
  Keep development database and model-control commands confined to their
  dedicated Inspector surfaces.
- Transcript surfaces may derive cache utilization from persisted Rig usage
  only when `total_tokens - output_tokens` reconciles with either the
  inclusive-input or separately reported cache-token shape. The Inspector shows
  each full request. Ordinary transcript surfaces must fetch the bounded,
  conversation-scoped chat-usage projection rather than `get_task_traces`, while
  every completed assistant footer in development and
  production builds aggregates all chat requests belonging to that durable Turn. Prefer an exact
  checkpoint match, but tolerate the runtime's request-scoped temporary
  checkpoint by associating its trace only when the coarse creation timestamp
  overlaps exactly one persisted terminal Turn window. Show observed
  cache reads and writes against the provider input total. Complete snapshots
  must restore each historical assistant response's owning checkpoint so one
  Turn never reuses the newest Turn's diagnostic usage. When cache counters are
  zero or provider totals cannot produce a valid hit rate, omit cache usage from
  that footer.
- In Tauri, selecting a different workspace or a conversation owned by another
  workspace prepares the target state and changes the current supervised Runtime
  with `set_workspace` before committing that state in the existing shell. The
  server's desktop authorization follows the Runtime-selected existing directory.
  Only File -> New window may route through `open_workspace_window` and launch a
  second process. Browser-only previews may continue applying a workspace locally.
- Application update checks expose one shared `idle`/`checking`/`installing`
  state to every desktop surface. Manual checks must disable duplicate input,
  show visible progress, apply a finite timeout, surface localized success or
  failure feedback, and always return to a retryable state after errors.
- Keep Rust event payloads aligned with `src/lib/types.ts`.
- Keep the global toast renderer inside the shared tooltip provider. Toast
  descriptions use the tooltip primitive for truncated detail, so rendering a
  described OAuth, updater, download, or error notice without that context
  raises a frontend exception instead of showing the notification. Render
  ordinary descriptions in their natural left-to-right paragraph direction so
  trailing Chinese punctuation stays at the end; opt into right-to-left
  overflow only for path-like values whose filename tail must remain visible.
  Update-available notices keep release notes in the description and expose a
  localized, real link to the matching GitHub release alongside the install
  action.
- Global frontend diagnostics may cross the local Tauri boundary only as
  allowlisted event, component, and error-type labels. Never forward exception
  messages, stack traces, transcript content, model output, tool data,
  configuration values, file content, or secrets. Remote export must honor the
  persisted diagnostics opt-out immediately; local rotating application logs
  remain available for deliberate support sharing.
- Configuration-change events are notifications only. Never project the
  configuration itself through the shared runtime event bus because it contains
  provider secrets and the bus can feed non-Tauri transports; desktop surfaces
  reload it through the local settings command. Settings autosave must retain
  the exact base snapshot, merge independent external changes, reject
  overlapping changes, and rebase edits made while a save is in flight. Never
  persist an uninitialized, fallback, or unchanged settings draft; configuration
  load failure must remain read-only so it cannot replace durable providers.
- Channel connection and login state is desktop-local capability data. Read
  adapter status and WeChat QR images through named Tauri commands only; never
  publish login material or credentials on the shared runtime event bus.
  Settings may poll local status while mounted and must stop that poll when
  unmounted.
- Keep additive configuration fields in `src/lib/types.ts` optional at the
  transport boundary so an older bootstrap or fallback snapshot remains
  readable. Materialize their canonical defaults only in
  `normalizeConfigShape`; page shells and settings components must not copy
  those defaults into independent fallback objects. The explicit
  `config_version` is optional only at that transport boundary and must be
  normalized to the current version before a settings snapshot can be saved;
  persisted unversioned configuration is handled by the pre-runtime transition,
  never by settings autosave.
- Do not recreate settings, configuration types, or tool presentation for the
  removed built-in webpage search and fetching capabilities.
- Per-server MCP `disabled_tools` is an additive optional transport field and
  normalizes to an empty list. Settings discovers the server's complete live
  tool list and persists only disabled names. Saving that list must rebuild the
  runtime MCP connections so disabled tools are absent from both later Agent
  definitions and dispatch, including resumed approvals; keep disabled names
  when a server temporarily stops advertising them so they remain disabled if
  they return.
- General model settings place the dedicated retry policy card as the final
  section after the Flash retry queue, separate from either model queue. The
  interval is displayed in seconds while preserving milliseconds at the
  transport boundary. Missing configuration defaults to three retries per model
  with 30 seconds between attempts; explicit stored values remain authoritative.
- Keep the canonical managed permission fallback layered as `host_root` read
  followed by workspace write. The frontend transport type and normalization
  must preserve `host_root`; collapsing an older payload to workspace-only
  access makes restored configuration diverge from the runtime sandbox policy.
  Keep its enforcement union aligned with the SDK and normalize any unsupported
  enforcement value to that managed fallback so a removed profile cannot retain
  ambient file-tool access in frontend state.
- `chat-response-started` means the stream connected, not that content arrived.
  Clear transient waiting state on the first text/thinking chunk and every
  terminal path.
- A successfully completed Agent reply sends a generic system notification
  through Tauri's notification plugin only while the owning desktop window is
  inactive according to a native activity read taken at completion. On Windows,
  resolve the foreground and Tauri HWNDs through their root-owner chains, then
  fall back to current-process ownership, so a focused WebView2 child window or
  app-owned native dialog cannot be mistaken for a background app. Deduplicate
  the terminal event and submit-reconciliation fallback by the stable assistant
  reply ID so one logical reply can trigger at most one notification attempt.
  Never include conversation or model content in the notification; permission
  denial, focus-read failure, and notification failure must not affect stream
  finalization. Interrupted, cancelled, and failed turns do not notify.
- Treat `chat-mermaid-render-request` as automatic frontend-assisted tool
  execution. Render with the shared Mermaid engine and return its structured
  result through `submit_interrupt_response`.
- Extend streamed formats only through `src/lib/streamdown/`.
