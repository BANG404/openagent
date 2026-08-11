---
name: openagent-chat-frontend
description: Preserve OpenAgent chat frontend behavior. Use for changes to MessageList, MessageInput, ToolCallCard, UserInputForm, FileChangeBanner, chatStream.ts, conversationDb.ts, checkpointTree.ts, transcript virtualization, streaming/final reconciliation, restore/bootstrap, attachment previews, chat events, Mermaid tool rendering, or visible chat state.
metadata:
  category: frontend-development
---

# OpenAgent chat frontend

Keep streaming and durable turns as two representations of the same logical
transcript. Avoid remounts and UI state loss during reconciliation.

## Transcript and streaming

- Completed messages and the active response share the dynamic-height virtual
  list.
- Keep ordinary transcript copy and the shared composer textarea on the same
  compact 14px type scale so streaming and editable durable content do not
  change apparent size.
- Keep streamed Markdown list markers outside the list-item content so loose
  lists whose items contain block paragraphs align each marker with the first
  content line.
- Style inline Markdown code through Streamdown's semantic codespan marker and
  application theme tokens. Do not depend on the renderer's optional utility
  classes; inline code must retain readable foreground and surface contrast in
  both light and dark themes without affecting fenced code blocks.
- Keep fenced Markdown code headers, containers, loading skeletons, and controls
  on application theme surfaces through stable chat theme hooks. Shiki owns
  highlighted token colors, not the surrounding block background; fixed light
  renderer utilities must never remain visible in the dark application theme.
- In responsive double-column mode, expanded process records participate in
  pagination instead of moving as one container. Keep the process header with
  its first record and preserve the same atomic break rules used by ordinary
  assistant content. Keep the completed-turn metadata and action footer outside
  column balancing as one full-width row below both columns. Use an explicit
  button-controlled process group instead of a native `details` element because
  WebView2 can lose toggle hit testing when an interactive element is fragmented
  across CSS columns. Keep collapsed process children mounted so their local UI
  state survives reopening.
- Position virtual rows without transform-promoted layers. CSS multi-column
  assistant content must not be nested in a forced compositor layer because it
  can flicker during WebView2 repaint invalidation.
- Disable per-record `content-visibility` inside every rendered virtual row in
  both single- and double-column layouts; the outer virtualizer is the sole
  transcript culling boundary. A skipped overscan record can otherwise report
  its intrinsic placeholder height through `ResizeObserver`, collapse the
  virtual scroll range, and move the reader before its full height returns.
  Every multi-column owner must apply this override itself; book mode renders
  through a dialog portal and cannot inherit the virtual list's descendant
  rules. Keep pagination recalculation positioning immediate so it cannot
  compete with the smooth animation reserved for an explicit page turn.
- Use the backend-preallocated assistant message ID as the live row key.
  Streaming and durable forms must share the same assistant-turn branch and
  keyed stream-item children.
- Reduce logical Turn metadata from checkpoints on the selected branch and
  attach it to the backend-preallocated response message. A tool interrupt and
  its resume keep that Turn key; only terminal Turn states expose duration,
  regenerate, copy, and book-mode actions. Ignore typed `memory` user content
  in every ordinary transcript, index, edit, copy, and book projection.
- Treat the selected branch tip's durable checkpoint as final Goal and Graph
  authority, not transient conversation badges. During streaming, project the
  complete checkpoint-owned `FlowState` carried by `goal-run-updated` after
  every Goal tool mutation and parent Graph node reduction; keep that live
  overlay until the matching persisted `chat-checkpoint` has been reconciled.
  Leave optimistic transcript records mounted throughout and ignore stale
  asynchronous refreshes so an older checkpoint cannot replace a newer live
  Goal or Graph state. A new or newly selected flow starts with its resizable
  right-side status panel collapsed to the edge peek; a user's expand or collapse
  choice survives later checkpoints for that same flow. Place the expanded panel
  as a full-height inset card inside the conversation workspace's flex container,
  using the same translucent Mica material as the conversation surface so it stays
  visually continuous while its persisted width reduces the conversation track.
  Paint one translucent Mica background on that shared workspace, and keep both
  the composer aurora and its bottom fades there rather than inside the
  conversation-only track. Stack the shared fades below the aurora, the shared
  Mica veil above it, and interactive conversation content above that veil so
  the color remains visible without making the surface overly transparent. Leave both
  the ordinary composer surface and
  the expanded panel body transparent so they reveal that same material and
  aurora. Retain the expanded panel's card border, radius, and shadow, but do not
  add a second backdrop layer that independently tints its body. The collapsed
  peek may add a Mica surface so its exposed edge remains discoverable.
  Collapse it out of that layout and beyond the right edge so only a vertically
  shortened, clickable strip of the card's left edge remains visible without
  overlapping native title-bar controls. The peek creates no layout track,
  full-height divider, glyph, or separate expand button; keep keyboard focus visible
  on that edge. Keep the expanded header free of decorative Goal or Graph kind
  glyphs and retain its collapse button. Center an otherwise empty planning state
  in the available panel body.
  Cap the expanded panel to its live
  container, let Goal cards grow to contain their wrapped task and result copy,
  and keep Goal items, summaries, and Graph dependency content inside the panel
  without widening its layout track or introducing horizontal scrolling. Match the
  conversation sidebar's direct manipulation behavior: capture the active
  pointer, disable width transitions and text selection while dragging, and
  restore them when the drag ends or is cancelled. Use the same resizer visual
  geometry as that sidebar: an 8px transparent hit target with a centered 2px
  primary indicator at the same hover, focus, and active opacity. Clear focus
  acquired by a pointer drag when it finishes so the active affordance cannot
  stick; preserve visible focus for keyboard resizing.
  Render Graph dependencies as a top-to-bottom directed flow diagram with
  arrowed SVG edges behind compact node cards. Limit parallel layers to
  readable responsive columns, clamp long visible task copy, and scale the
  complete graph into the panel's remaining viewport without introducing a
  nested scrollbar. Preserve complete task and dependency context for assistive
  technology.
- Finalization updates the existing row instead of replacing its DOM subtree,
  preserving open thinking sections. Restored historical thinking starts
  collapsed.
- Keep every failed model attempt as its own ordered retry record and divider
  inside the same logical assistant turn. The turn-level process disclosure may
  contain several retries because automatic recovery must still produce one
  final Agent reply; never merge one attempt's nested stream items into another.
- Keep the turn-level process disclosure mounted throughout an active stream
  whenever process records exist, including intervals with no trailing final-text
  run. A later thinking or tool record must not make the working header disappear.
- Treat assistant records separated only by a tagged context-compaction replay
  as one complete Agent reply. Keep the compaction boundary at its real
  position inside that reply, with one action footer after the final record.
  When manual compaction completes, refresh its checkpoint immediately so the
  divider appears without waiting for another user turn. While compaction is in
  flight, keep one localized transient process record mounted and update its
  checking, summarizing, and persistence stages in place; retain a terminal
  failure briefly, and replace successful progress with the durable divider only
  after checkpoint reconciliation. Do not show a redundant success toast for
  the same transition.
  Do not show the reply actions—including regenerate, copy, and book mode—while
  the conversation is streaming, even when a durable prefix exists before a
  live context-compaction continuation. Reveal the actions together only after
  the complete Agent reply finishes.
  Book mode opens from that footer and flows each complete reply continuously
  across a two-column, full-window spread, adding pages when the reply exceeds
  one spread. Match Mermaid fullscreen's fixed viewport footprint and inner
  framed surface, without duplicating native window controls. Both fullscreen
  surfaces reserve a continuous drag region from the outermost top window edge
  through their header and keep it outside page-turn, Mermaid pan/zoom, and
  toolbar controls; keep only the two
  dedicated page-turn controls at the vertical center of the reading surface.
  The persisted body font size belongs to General settings.
  Fragment Markdown tables between rows instead of treating the whole table as
  one page-sized atom. Keep rich atomic embeds such as images, video, charts,
  Mermaid, code, and HTML previews within the usable page height; preserve
  their native containment or internal scrolling rather than clipping content.
  Recalculate after embedded media loads as well as after resize or expansion.
  Retain the same collapsible process-record grouping instead of flattening or
  dropping work details. When expanded, change the process content from its
  ordinary flex stack to a fragmentable block inside the book's multi-column
  owner, and keep only atomic records from splitting across columns.
- The application virtualizer owns tail following and height correction; keep
  native browser anchoring disabled. Batch dynamic row measurements per frame
  and preserve the first rendered row crossing the viewport start by its real
  DOM coordinate, so resolving estimates cannot move the reader. Keep an index
  destination mounted until its real row position remains aligned across
  consecutive layout frames.
- After completion, reconcile the optimistic turn with its durable checkpoint
  in the background. Do not show the conversation-loading skeleton, remount an
  unchanged transcript, overwrite backend history, or remove optimistic
  messages from a queued turn.
- New checkpoints carry compacted context inside the tagged user replay rather
  than adding a system message. Represent the whole record only by the divider,
  while continuing to restore legacy system-boundary checkpoints.

## Tool and interrupt rendering

- Render durable `ask_user` calls with the dedicated input component, resolved
  by their matching ToolResult after streaming, reload, and branch switches.
- Project every durable ToolResult content block into the same concise text used
  by live tool events: preserve text, serialize JSON values, and represent image
  results without exposing encoded bytes. Structured tool output must not become
  a successful but blank card after finalization, reload, or branch switching.
- Group consecutive ordinary ToolCalls into one collapsed summary row with
  independently expandable calls.
- Keep ordinary and enhanced file/search tool cards on the same neutral
  perimeter. Reserve the blue accent for real interaction state such as
  keyboard focus or an actively running tool, not for the tool's type.
- Keep `ask_user`, approvals, HTML previews, and other dedicated tools outside
  ordinary grouping.
- Render `render_mermaid` as a standalone virtual row from ToolCall source and
  restore it from the matching durable ToolResult. Do not display failed
  `render_html` or `render_mermaid` previews; running and successful render
  calls remain visible, and failures from ordinary tools retain their cards.
- During an active stream, the empty composer's primary action pauses output;
  once paused it resumes output, unless a draft or attachment is present, in
  which case it remains the send action. Sending a queued follow-up from the
  paused state resumes the current stream so queue dispatch cannot deadlock.
  Keep stop as a separate terminal action and clear transient pause state on
  every terminal path and conversation switch.
- The main conversation composer exposes the same global approval mode as
  General settings. Switching `manual`, `auto`, or `off` saves the normalized
  configuration without changing the independent permission profile; quick
  chat does not own or mutate this control.

## Attachments and editing

- Reuse one attachment preview component in composer and restored transcript.
- Open attachment previews in the same full-window visual frame used by rich
  Mermaid and book previews: center the attachment within the framed canvas and
  keep preview controls in the top-right. Image previews expose zoom out, fit,
  zoom in, and close controls; text and unavailable states retain the same
  centered frame and close placement. Gate opening through an explicit extension
  whitelist so unsupported formats remain non-previewable. Reset every image
  preview to fit whenever it opens; toolbar and pointer-anchored wheel zoom share
  the same bounded scale, and enlarged image content scrolls inside the frame
  instead of clipping. Lightweight text previews retain normal scrolling and do
  not expose zoom controls or intercept the wheel. PDF remains uploadable but is
  excluded from the preview whitelist and must never be embedded in the WebView.
- In the ordinary composer, render pending attachments as 112px preview cards in
  one horizontally scrollable row: preview image and supported text content,
  keep the filename anchored at the card foot, and keep the remove action at
  the top-right. Quick chat retains its 28px single-line attachment strip
  because its native window height is fixed.
- Keep editable user messages discoverable without adding a second action
  target: the message bubble retains its accessible edit label and reveals a
  non-interactive pencil affordance on pointer hover or keyboard focus.
- Collapse long user-message text by a fixed number of complete rendered lines
  on an inner content layer. Keep bubble padding outside the clamp so changing
  type metrics cannot expose or crop a partial trailing line. Apply preserved
  whitespace only to that content layer so template spacing around it cannot
  create leading or trailing blank lines.
- Restored previews load blob bytes on demand. Do not embed bytes in checkpoint
  IPC payloads.
- Removing a restored attachment is a staged edit: cancel restores it; send
  creates a new branch and preserves the original.
- Repair an app-managed pasted attachment only by checkpoint SHA-256 match.
  Missing external-file blobs require reselecting the original file and
  verifying the same SHA-256.

## Selectors and menus

- Keep click-opened menus, context menus, selects, comboboxes, and compact
  download choices on one desktop menu scale: 12px labels on a 20px line,
  28px minimum height for single-line items, 4px by 14px item padding, 6px
  content inset, 5px item radius, 8px content radius, a 3px gap between
  adjacent items, and 7px vertical space around separators. The gap must keep
  neighboring hover and selected fills visibly separate. Options with
  descriptions may grow vertically and use 11px secondary copy; do not
  compress them to the single-line height.
- Keep selection signaling consistent across floating option rows and persistent
  navigation lists: each component keeps its ordinary neutral hover fill for
  the selected row and adds a square-ended primary-colored left rail. Do not
  introduce a stronger selected fill, checkmark, selected text color, or rounded
  endpoints on that rail.
- Keep the workspace switcher's root menu focused on open-folder actions.
  Keep the current-folder-location action text-only instead of repeating a
  folder glyph beside it.
  Place older workspaces in a side-opening recent-workspaces submenu that
  supports hover, click, and keyboard navigation. Show each complete workspace
  path without per-row icons, mark WSL shares explicitly, and keep an overflowing
  list's scrollbar flush with the submenu's right edge.
- Keep the composer slash-command and mention palette on the shared compact
  menu row scale. Align its width to the composer, use a 14px floating-surface
  radius with the shared 6px inset, and let both surfaces follow their visible
  items up to the lesser of the configured 320px maximum and the live space
  above the composer, retaining an 8px viewport inset. Recalculate that space
  for window, visual-viewport, composer-height, and scroll changes. Only
  overflow scrolls independently, so short result sets leave no trailing empty
  area, constrained windows never clip the palette, and opening or navigating
  them never moves the composer. Keep slash-command rows to the command token
  and description only, without trailing hints or decorative glyphs.
- Keep the localized shared-composer placeholder concise while advertising the
  Enter and Shift+Enter keyboard behavior plus the `/` command and `@` mention
  palette triggers.
- Selecting `/goal` or `/graph` replaces only the active slash trigger with the
  complete command token. Preserve any draft text after the caret as the command
  argument instead of clearing the composer.

## Startup and restore

- Use the synchronous per-workspace restore hint only for first render, then
  reconcile through the unified bootstrap IPC.
- Derive first-run onboarding visibility from the normalized bootstrap config.
  Persist completion in the versioned config beneath `OPENAGENT_HOME`; migrate
  the legacy WebView-local marker once and remove it only after the durable save
  succeeds.
- Persist a newly created conversation and active-workspace selection
  atomically before its first turn.
- Keep the main window hidden until the bootstrap snapshot is applied; retain
  the failure watchdog.
- Use transcript-shaped and composer skeletons during history loading. A new
  conversation's greeting and composer skeletons belong to the same measured
  centered stack so their placeholders cannot overlap. Skeleton user bubbles
  mirror the translucent composer surface instead of introducing a separate
  opaque message treatment.
- Keep the conversation sidebar background flat and free of decorative glow;
  communicate active streaming through the conversation row indicator only.
- Keep the expanded conversation sidebar resizable from its trailing edge between
  180px and 360px. Persist the chosen width across collapse and reload, disable
  width animation while dragging, and expose the same bounds to keyboard users.
- Keep the Memory view's horizontal resize handle quiet at rest, but render its
  short primary-colored grip at full opacity on hover and while dragging so the
  active separator remains visible in both themes.
- Size the expanded sidebar's header role trigger to its visible role name and
  omit the redundant caret. Keep the back and forward controls fixed beside the
  sidebar-collapse button so role-name length cannot move them. Tie those
  controls to the window's real destination history: conversations, the
  new-conversation surface, and feature views all participate; visiting a new
  destination after going back discards the abandoned forward branch, and
  deleting a conversation removes its stale destinations.
- Keep desktop conversation rows at a compact 30px height. Ellipsize long
  titles at rest, reveal their complete text with a measured horizontal scroll
  on pointer hover, retain the static ellipsis under reduced motion, and do not
  add a tooltip to conversation titles. Keep a 3px parent-owned gap between
  adjacent conversation rows so hover and active fills remain visibly separate
  at every nesting depth and in search results.
  Keep Goal, Graph, and Graph-node conversation titles free of leading flow
  glyphs; hierarchy, active state, and streaming state already communicate their
  sidebar structure without a decorative workflow badge.
  Keep the new-conversation and search actions, conversation rows, expanded
  sidebar navigation, and settings navigation on the same single-line scale:
  30px height, 13px type on an 18px line, 10px horizontal padding, an 8px
  content gap, a 7px radius, and a 3px parent-owned row gap. The workspace role
  selector at the top of the sidebar remains a distinct selector control.
- Use the theme canvas for the workspace surface and retain the low-contrast
  ambient aurora behind the composer and new-conversation greeting. Keep the
  empty-state aurora mounted across conversation changes
  and crossfade its visibility against the composer aurora; do not remount a
  fully opaque animated layer when the active conversation becomes empty. Fade
  in the generated memory note's ambient layers on the same opacity rhythm so
  the two empty-state light fields cannot flash on together. On a new
  conversation, treat the greeting and composer as one vertical stack whose
  measured total height determines its position slightly above the geometric
  center, and constrain that composer to a 760px outer column. Give its compact
  textarea more single-line height than the bottom-anchored composer, and keep
  the loading skeleton at the same expanded height. Do not position the greeting
  and composer independently. Ordinary conversations keep the composer anchored
  to the bottom in the wider 900px outer column. The shared composer and its
  loading skeleton use the application Mica surface in both positions.
  Keep the model, reasoning-effort, and approval triggers inside that composer
  surface-free at rest; standalone Select material must not leak into the
  toolbar. Keep the composer shell's neutral Mica perimeter unchanged when its
  textarea receives focus; embedded toolbar controls retain their own focus
  rings, which expand outside each control boundary instead of inset.
- Let the conversation shell own the custom title-bar clearance. Keep the
  ordinary transcript's own top inset compact so it does not stack a second
  header-sized gap above the first message or debug context.
- An explicitly empty durable active-conversation marker restores the centered
  new-conversation surface, even when older conversations exist. Never fall
  back to the newest conversation.
- Treat the new-conversation action as idempotent while that surface is already
  visible. Do not reload its memory greeting, rewrite its durable active marker,
  or toggle its loading skeleton on a repeated click.
- Keep the right-side user-message index on one shared tooltip surface. Do not
  render a second inline message preview for the same index marker.
- Do not render approval controls for a switched branch until its active tip is
  durable.

## Quick chat

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
  composer textarea after the native launcher window has been shown and focused;
  the persistent hidden window does not remount its composer between sessions.
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
  Keep the card on a theme-tinted Windows-Mica-inspired material composited over
  an opaque theme base, so content behind the launcher never shows through.
  Give it a clearly visible perimeter and compact, clearly readable elevation; selector
  surfaces remain opaque.
  Do not render a title bar, shortcut hint, or window-action row above the
  composer; the compact card begins directly with input. Preserve native
  dragging from non-interactive card space. Keep a generous top inset above the
  textarea as the primary grab target, and open selectors below and visually outside the card,
  aligned to their trigger start edge, without collision-based side flipping.
  Give the launcher card only a restrained shadow. Keep its 760px card width
  separate from the wider transparent native canvas, with 48px horizontal stage
  insets so the shadow fades before the WebView boundary instead of forming a
  clipped edge. Give selector content the shared raised shadow, while
  keeping the search field inside it shadowless at rest. Let selector content follow
  its items up to a bounded scrollable maximum height; role descriptions stay on
  one ellipsized line so one role cannot consume the menu. Separate the composer
  and selector toolbar with only the short inset divider; do not add a second
  full-width toolbar border. Each selector trigger owns its leading
  icon, label, and caret as one hover, focus, open-state, and pointer target.
- Keep the compact composer height bounded and content-driven. Let the shared
  textarea's measured height grow the card through a small multi-line range;
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
  and keyboard interaction checks addressable without native state.
- Keep the development-only `command-palette-preview` query available for the
  shared composer slash-command palette. Its `-theme` and `-locale` query
  parameters must keep light/dark and Chinese/English keyboard, scrolling, and
  selection checks addressable without onboarding or native state.
- Keep the development-only `pause-control-preview` query available for the
  shared composer's streaming primary action. Its `-theme` and `-locale`
  parameters must keep pause, resume, send, light/dark, and Chinese/English
  checks addressable without a native runtime.
- Keep the development-only `attachment-composer-preview` query available for
  the shared composer's pending-attachment cards. Its `-theme` and `-locale`
  parameters must keep card preview, removal, upload, horizontal overflow,
  pointer-anchored image zoom, normal text scrolling, PDF and unsupported-extension blocking,
  light/dark, and Chinese/English checks addressable without native state.
- Keep the development-only `checkpoint-flow-preview` query available for the
  right-side Goal/Graph checkpoint panel and composer approval selector. Its
  `-kind`, `-theme`, and `-locale` query parameters must keep Goal/Graph,
  resize/collapse, approval selection, light/dark, and Chinese/English checks
  addressable without a native runtime. The `-empty` parameter exposes the
  centered Graph planning state directly.
- Keep the development-only `book-mode-preview` query available with long,
  process-bearing fixture content. Its `-theme` and `-locale` query parameters
  must keep two-column flow, multi-page navigation, process collapse, and
  light/dark Chinese/English checks addressable without onboarding or native
  state.
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
  automation task cards, task status/toggle capsules, optional custom-instruction
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

## IPC and events

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
- General model settings keep the retry count and interval in a dedicated retry
  policy card, separate from either model queue. The interval is displayed in
  seconds while preserving milliseconds at the transport boundary. Missing
  configuration defaults to three retries per model with 30 seconds between
  attempts; explicit stored values remain authoritative.
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
- Treat `chat-mermaid-render-request` as automatic frontend-assisted tool
  execution. Render with the shared Mermaid engine and return its structured
  result through `submit_interrupt_response`.
- Extend streamed formats only through `src/lib/streamdown/`.

## Verification

Treat this skill as the living source of truth for chat frontend behavior.
Whenever a change alters a transcript, composer, tool, streaming,
reconciliation, restore, attachment, event, or streamed-content invariant,
update the corresponding instruction here in the same change. Record the
resulting invariant and delete superseded guidance instead of appending a
changelog. Update `docs/` as well when the public product or architecture
contract changes.

Run `bun run check` and `bun run format:check`. For visible changes, verify
light/dark themes, Chinese and English copy, streaming-to-durable finalization,
reload, and branch switching. Run `bun run check:docs` before handoff.
Keep transcript imports aligned with rendered branches so obsolete loading-state
components do not survive as lint failures after their UI branch is removed.
