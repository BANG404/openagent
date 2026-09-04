# Quick chat and preview surfaces

- Keep top-level surface dispatch in the route composition root. The dedicated
  Quick Chat surface owns launcher configuration, focus, attachment, submission,
  and settings-reload state; its window service owns sizing, positioning, and
  shortcut registration. Development preview surfaces own their fixtures and
  query-specific theme/locale initialization so preview-only state never joins
  the durable conversation runtime.
- Open main-window Settings as one centered modal above the unchanged chat
  shell. Preserve the complete settings navigation inside that modal, trap
  focus through the dialog primitive, and return to the same chat state on
  close instead of replacing the main content region. Give the dialog one
  90%-opaque theme surface with saturated backdrop blur, and keep its nested
  settings panel transparent so chat content cannot compete with settings text.
- The saved-role editor is a separate centered dialog opened from the Role
  application menu. It edits the role system prompt and optional skill/MCP associations;
  empty associations preserve the full resource set, while non-empty
  associations narrow the resources exposed to that role.
- The Raycast-style quick chat is a dedicated, workspace-neutral Tauri window,
  not a presentation mode of `main` and not a second chat client. It owns no
  transcript. The primary process owns its shortcut and launcher lifecycle,
  while workspace windows retain their size, position, visibility, and runtime
  state.
- Quick chat persists its own last-selected model, role, and workspace. Every
  submission creates a fresh durable conversation, routes the first turn to
  the selected workspace process, opens or focuses that workspace window, and
  displays the new streaming conversation there. The launcher must not mutate
  the primary window's active workspace, role, model default, or transcript.
  Reload launcher settings when configuration changes so enabled model options
  stay current. Preserve the launcher's model while it remains available; if
  it becomes unavailable, fall back to the configured default and then the
  first available model. Every successful in-app settings save must emit the
  payload-free `settings-changed` notification after persistence, because the
  file watcher suppresses a reload for configuration already applied in memory;
  the hidden launcher reloads the local settings and reapplies its theme.
- Losing native focus closes the launcher except while a submission, native
  picker, or window drag owns focus. Suppress focus-close handling for the full
  native operation rather than only disarming its current state, because focus
  can toggle during the operation. A submission hides the launcher only after
  the target workspace accepted the turn; failures keep it visible with its
  draft intact. Every shortcut reveal must explicitly return DOM focus to the
  composer textarea after the native launcher window has been shown and focused,
  and the native focused callback must repeat that request after the operating
  system confirms activation. The persistent hidden window does not remount its
  composer between sessions.
- A webview cannot paint beyond its native window bounds. Keep the launcher
  card compact and fixed-height. Prepare the transparent native window at its
  expanded selector size before showing it, keep that size fixed for the whole
  visible session, and shrink it only after hiding; resizing a visible
  transparent webview causes native-window jitter. The host's Tauri dependency
  must retain the `macos-private-api` feature and `app.macOSPrivateApi` must
  remain enabled in `tauri.conf.json`; Tauri rejects every platform build when
  the Cargo feature and configuration allowlist disagree, while macOS omits
  the transparent window builder API when both are disabled. Clicking the
  unused transparent area dismisses the launcher.
  Persist physical positions reported by native window moves. Before every
  reveal, restore a saved position only when the expanded window retains a
  usable visible area inside a current monitor work area; malformed or
  off-screen history must be cleared before restoring the centered default.
  Keep the complete card on one opaque theme surface using the shared
  conversation-input perimeter, radius, and elevation, so content behind the
  launcher never shows through.
  Give it a clearly visible perimeter and compact, clearly readable elevation; selector
  surfaces remain opaque.
  Do not render a title bar, shortcut hint, or window-action row above the
  composer; the compact card begins directly with input. Flatten the embedded
  `MessageInput` perimeter so it does not create a second card, and place the
  attachment, model, role, workspace, and send controls together in the same
  bottom toolbar as the ordinary conversation composer. Preserve native
  dragging from non-interactive card space and keep a dedicated 12px top-edge
  drag strip inside the rounded perimeter without covering editable text. Open
  selectors below and visually outside the card,
  aligned to their trigger start edge, without collision-based side flipping.
  Give the launcher card only a restrained shadow. Keep its 760px card width
  separate from the wider transparent native canvas, with 48px horizontal stage
  insets so the shadow fades before the WebView boundary instead of forming a
  clipped edge. Give selector content the shared raised shadow, while
  keeping the search field inside it shadowless at rest. Let selector content follow
  its items up to a bounded scrollable maximum height; role descriptions stay on
  one ellipsized line so one role cannot consume the menu. Separate the composer
  and selector menus through layout and elevation rather than a divider inside
  the unified card. Each selector trigger owns its leading
  icon, label, and caret as one hover, focus, open-state, and pointer target.
- Keep the compact composer height bounded and content-driven. Let the shared
  textarea's measured height grow the card through a small multi-line range;
  keep its typography and horizontal inset on the ordinary composer's compact
  14px scale.
  an attachment adds one compact row, and content beyond the maximum scrolls
  internally. Render attachments as a shadowless, single-line compact strip
  in normal flow above the textarea and scroll it horizontally so scrolled text
  never passes beneath a fixed attachment overlay. Keep attachment and send
  controls vertically aligned at the composer end, and do not render a leading
  glyph before the quick-chat textarea. Treat the native attachment dialog
  like the workspace picker: suppress focus-close for its full lifetime and
  restore launcher focus after it closes.
- General settings owns the persisted quick-chat accelerator. Capturing a new
  accelerator requires at least one modifier and stores the portable Tauri
  representation. Capture keydown events at the window level while recording;
  do not depend on the recorder button retaining keyboard focus because macOS
  WebKit may not focus a button after a pointer click. Re-registration is
  transactional: unregister the old
  accelerator, register the new one, and restore the old registration plus
  saved value when the operating system rejects or already owns the new
  accelerator.
- Every editable field in General settings keeps a visible localized
  description next to its label, including nested numeric controls. A section
  heading or neighboring field description does not replace field-level help.
  Apply the same label-and-description structure to every row that uses the
  shared settings-card pattern in other settings tabs. Keep numeric inputs in
  those card rows at the shared compact width and align them to the card's
  trailing edge, including fields nested in a control wrapper.
- Role and workspace changes affect only the next quick-chat conversation.
  Never restore or render conversation history in the launcher.
- Keep the search field inside every searchable selector menu transparent and
  shadowless at rest, including role, model, and workspace selectors. Show only
  the shared focus ring during keyboard focus.
- Keep the development-only `quick-chat-preview` query available for browser
  layout verification. Its composer and browser-backed attachment picker stay
  interactive for overflow stress checks, but submission stays disabled; it
  must not register shortcuts or emulate native window behavior outside Tauri.
  The launcher card uses the shared theme-aware Windows-Mica-inspired material
  composited over an opaque theme base and keeps the surrounding native-window
  stage transparent. Its `-theme`
  parameter must accept both explicit `light` and `dark` values so either theme
  remains verifiable regardless of the operating-system preference.
- Keep the development-only `reasoning-effort-preview` query available as a
  direct, interactive browser surface for the shared ChatGPT OAuth effort
  selector. It must bypass onboarding and native state, and its `-theme` and
  `-locale` query parameters must keep light/dark and Chinese/English checks
  addressable without navigation.
- Keep the development-only `workspace-switcher-preview` query available for
  the shared workspace menu and recent-workspaces submenu. Its `-theme` and
  `-locale` query parameters must keep light/dark and Chinese/English pointer
  and keyboard interaction checks addressable without native state. Its
  `-platform=windows|macos|linux` parameter must keep Windows-only WSL action
  visibility directly verifiable.
- Keep the development-only `command-palette-preview` query available for the
  shared composer slash-command palette. Its `-theme` and `-locale` query
  parameters must keep light/dark and Chinese/English keyboard, scrolling, and
  selection checks addressable without onboarding or native state.
- Keep the development-only `input-surfaces-preview` query available for direct
  comparison of the composer, model and workspace menus, and open role-selector
  panel. Its `-theme` and `-locale` parameters must keep
  the shared surface treatment verifiable in light/dark themes and
  Chinese/English copy.
- Keep the development-only `pause-control-preview` query available for the
  shared composer's streaming primary action. Its `-theme` and `-locale`
  parameters must keep pause, resume, send, light/dark, and Chinese/English
  checks addressable without a native runtime.
- Keep the development-only `approval-queue-preview` query available for
  rapidly resolving several real tool-approval cards. Its `-theme` and
  `-locale` parameters must keep independent optimistic approve/deny behavior,
  light/dark themes, and Chinese/English copy directly verifiable without a
  native runtime.
- Keep the development-only `runtime-notice-preview` query available for the
  standard persisted interruption divider. Its `-theme` and `-locale` parameters
  must verify that the localized title is not followed by the redundant durable
  English reason and that pending input remains visible without a process
  disclosure in light or dark mode.
- Keep the development-only `compaction-status-preview` query available for the
  shared manual-compaction divider. Its `-theme` and `-locale` parameters must
  keep checking, summarizing, persistence, failure detail, and durable completion
  states directly verifiable in light/dark themes and Chinese/English copy.
- Keep the development-only `streaming-transcript-preview` query available for
  fully mounted dynamic-height Turn verification. It must continuously grow one live
  Turn so tail following, reader-controlled upward scrolling, the visible native
  transcript scrollbar during activity with stable geometry and idle hiding,
  contained boundary scrolling, and
  light/dark rendering remain directly testable without a native runtime.
- Keep the development-only `cache-usage-preview` query available for the
  completed-turn footer. Its `-theme` and `-locale` parameters must keep an
  independently aggregated cache-hit state for multiple completed Turns and a
  hidden missing-usage state directly verifiable in light/dark themes and
  Chinese/English copy.
- Keep the development-only `tool-diff-preview` query available with a large
  `edit_file` fixture. Its `-theme` and `-locale` parameters must keep bounded
  expansion, light/dark themes, and Chinese/English rendering directly
  verifiable without native state.
- Keep the development-only `tool-status-preview` query available for the
  shared ToolResult lifecycle. Its `-theme` and `-locale` parameters must keep
  waiting, successful, unanswered, hidden-failure, pending `ask_user`, and
  unanswered `ask_user` rendering directly verifiable in light/dark themes and
  Chinese/English copy without native state.
- Keep the development-only `mermaid-finalization-preview` query available for
  exercising a live Mermaid render through the completed-Turn process-fold
  transition. Its `-theme` and `-locale` parameters must keep the transition,
  collapsed process disclosure, rendered SVG, light/dark themes, and
  Chinese/English copy directly verifiable without native state.
- Keep the development-only `media-sources-preview` query available for AGUI
  image source verification. Its `-theme` and `-locale` parameters must keep
  workspace-confined `file://` resolution, inline `data:image` rendering,
  light/dark themes, and Chinese/English copy directly verifiable without
  native state.
- Keep the development-only `attachment-composer-preview` query available for
  the shared composer's pending-attachment cards. Its `-theme` and `-locale`
  parameters must keep card preview, removal, upload, horizontal overflow,
  pointer-anchored image zoom, normal text scrolling, PDF and unsupported-extension blocking,
  light/dark, and Chinese/English checks addressable without native state.
- Keep the development-only `quote-context-preview` query available for
  selecting assistant text, opening the localized Add-to-chat action, adding
  and removing composer quote rows, and checking light/dark Chinese/English
  rendering without native state. Keep a rendered math expression in its fixture
  so KaTeX selection and quote rendering remain directly verifiable. Quote rows
  use a borderless surface and grow with wrapped text instead of truncating the
  selected context to a fixed line count.
- Keep the development-only `checkpoint-flow-preview` query available for the
  right-side conversation-details panel and composer approval selector. Its
  `-kind`, `-theme`, and `-locale` query parameters must keep Goal/Graph, edited
  file tabs, resize/collapse, approval selection through the real
  composer-preferences save queue, light/dark, and Chinese/English checks
  addressable without a native runtime. The `-empty` parameter exposes the
  centered Graph planning state, while `-files-only` removes Goal/Graph to
  exercise the file-only panel directly.
- Keep the development-only `book-mode-preview` query available with long,
  process-bearing fixture content and consecutive ordinary tools that exercise
  grouped tool-call rendering. Its `-theme` and `-locale` query parameters must
  keep two-column flow, multi-page navigation, process collapse, and light/dark
  Chinese/English checks addressable without onboarding or native state.
- Keep the development-only `permission-settings-preview` query as the direct,
  interactive surface for execution permissions. Its `-theme` and `-locale`
  parameters must keep managed, disabled, preset, custom-rule, network, warning,
  light/dark, and Chinese/English states addressable without native
  configuration. Approval and `permission_profile` remain separate settings;
  editing one must never rewrite the other or flatten existing custom filesystem
  entries. Keep controls inside the Mica permission card shadowless with a thin
  divider-colored border; reserve the Mica shadow for the outer surface.
- Keep the development-only `channels-settings-preview` query as the direct
  browser surface for Settings → Channels. Its `-theme` and `-locale` query
  parameters must keep the channel list, credential forms, responsive layout,
  light/dark themes, and Chinese/English copy addressable without native state.
  Keep each credential form and its enablement footer on one continuous card;
  the footer uses a divider rather than a nested surface or shadow.
- Keep the development-only `agents-settings-preview` query as the direct
  browser surface for Settings → Agent tasks. Its `-theme` and `-locale` query
  parameters must keep the grouped conversation-organization and background-
  automation task cards, switch-only task controls, optional custom-instruction
  disclosures, inset row dividers, light/dark themes, and Chinese/English copy
  addressable without native configuration. Keep memory subfeatures and the
  compaction threshold inside their owning task rows, and identify automatic
  approval as controlled by the global approval mode instead of adding a second
  task switch. Do not reintroduce gray fills on nested setting rows.
- Keep the development-only `agent-plugins-settings-preview` query as the direct
  browser surface for Settings → Agent Plugins. Its `-theme` and `-locale`
  parameters must keep Mica plugin cards, installed components, compatibility
  diagnostics, responsive layout, light/dark themes, and Chinese/English copy
  addressable without native plugin state. Plugin cards and loading or empty
  states must not use a flat secondary gray fill.
- Keep the development-only `mcp-settings-preview` query as the direct browser
  surface for Settings → Extensions → MCP. Its `-theme` and `-locale` query
  parameters must keep enabled and disabled tool switches, long wrapping tool
  names, light/dark themes, and Chinese/English copy addressable without a
  native MCP server.
- Settings action controls use one compact, shadowless semantic hierarchy:
  primary blue pills for creation, divider-bordered filled controls for ordinary
  file, test, and navigation actions, blue controls for inline row construction,
  and restrained danger-tinted controls with a subtle matching perimeter for
  destructive actions. Model-configuration dialog save and delete actions use
  those shared primary and danger controls so hover, pressed, focus-visible, and
  disabled feedback stays consistent. Size ordinary action buttons
  to their content, let creation actions in a fixed list footer fill its available
  width, and align standalone form-testing actions to the trailing edge. Keep
  informational callouts free of decorative borders and render destructive
  action rows on the neutral Mica surface without a danger-tinted perimeter or
  background. Settings enablement controls render only the switch; do not place
  redundant enabled/disabled status text, status dots, or action labels beside
  it, and preserve a localized accessible name on the switch itself. Route
  provider filtering and node deletion through the same shared settings-action
  control as neighboring actions.
- Channel ID allowlists use the shared fixed-height settings list input. Keep
  resizing disabled and let long lists scroll vertically inside the control so
  every channel configuration retains the same layout height.
