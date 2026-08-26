---
name: openagent-chat-frontend
description: Preserve OpenAgent chat frontend behavior. Use for changes to MessageList, MessageInput, ToolCallCard, UserInputForm, FileChangeBanner, chatStream.ts, conversationDb.ts, checkpointTree.ts, transcript rendering, streaming/final reconciliation, restore/bootstrap, attachment previews, chat events, Mermaid tool rendering, or visible chat state.
metadata:
  category: frontend-development
---

# OpenAgent chat frontend

Keep streaming and durable turns as two representations of the same logical
transcript. Avoid remounts and UI state loss during reconciliation.

## Shared product-host contract

- Treat Tauri/Svelte and GPUI as product hosts over the same public SDK facade.
  GPUI must consume the SDK startup bootstrap, runtime event stream, settings,
  workspaces, roles/models, conversations, and durable checkpoints; it must not
  duplicate the runtime state machine, transport definitions, configuration or
  database ownership, flow selection, or slash-command parsing.
- Restore the complete durable host snapshot before subscribing to runtime
  events. Treat events as lossy live projections rather than an authoritative
  store or replay log. On terminal and checkpoint events, reload and reconcile
  the relevant durable conversation/checkpoint state; do not infer final state
  from event delivery or compensate with a host-local runtime state machine.
- Submit every ordinary chat message and slash command from either host through
  `submit_agent_input` so runtime routing and command semantics remain shared.
- Use Tauri/Svelte as GPUI's visual and functional parity source. GPUI
  intentionally omits the decorative aurora glow while preserving shared
  geometry, neutral selection fill, semantics, accessibility, and pointer and
  keyboard interactions.

## Transcript and streaming

- Keep the route as the desktop composition and runtime-coordination boundary.
  The desktop sidebar owns its width, resize gesture, collapse persistence, and
  conversation navigation chrome; the shared title bar owns application menus,
  sync, and window chrome across chat and Settings. The title bar renders File,
  Edit, and Help only; do not restore the removed Configure menu or its Memory,
  Roles, and Skills management surfaces and shortcuts. Keep its center free of
  workspace names and Git branches so the
  remaining drag region stays visually quiet. The route owns the native
  window-focus state and passes that same value to both top-chrome segments, so
  the sidebar collapse/history controls
  and title-bar content dim and restore together without changing their shared
  native window material or geometry. The ordinary Tauri shell must keep its
  WebView, shared chrome, feature canvases, and conversation workspace at one
  consistent 30%-opaque theme tint over the Rust-owned Mica/Acrylic/Blur or
  macOS Vibrancy effect, leaving roughly 70% of the native material visible.
  Content-bearing controls and cards paint their own surfaces. Browser
  previews retain the opaque theme canvas, and the quick-chat transparent stage
  keeps its separate contract. Serialize native theme changes so rapid Settings
  previews cannot complete out of order. Returning to the system theme must
  clear the native override before resolving the WebView media preference,
  because the previous native override can still influence that query.
  The conversation surface owns transcript/composer
  composition, Goal/Graph panel presentation, and chat renderer theme overrides.
  Pass each surface a deliberate view model and action contract instead of
  returning leaf component markup or surface-local layout state to the route.
- Keep transient per-conversation stream maps in the dedicated stream-state
  controller. The page shell coordinates durable conversation/checkpoint data
  with that controller, but must not recreate parallel maps for streaming,
  pause, timing, awaiting-output, or memory-retrieval state.
- Completed messages and the active response share one keyed, fully mounted
  transcript list. Do not reintroduce viewport virtualization or row-height
  estimation: restored and live rows stay mounted so loading and scrolling do
  not repeatedly construct transcript content or discard row-local UI state.
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
- AGUI `Image` sources may be HTTP(S), workspace paths, `file://` URLs, or
  `data:image/...` URLs. Convert file URLs back to filesystem paths and resolve
  them through the same workspace-confined media capability as ordinary local
  paths; inline only image-typed data URLs directly. Keep `Video` and every
  other URI scheme on the existing HTTP(S) or workspace-path boundary, and do
  not expose encoded image bytes through fallback alt text or error details.
- Intercept every Agent-authored Markdown link before WebView navigation. Open
  absolute HTTP(S) destinations through the surface's UI capability: Tauri uses
  the native system opener, while browser-backed previews and remote surfaces
  synchronously create an isolated browser tab. Consume opener failures and
  leave relative or non-web destinations inert. Never fall back from a failed
  native opener to WebView `target=_blank` navigation, which can recreate the
  crash path. The desktop capability must grant both the opener command and its
  default HTTP(S) URL scope; command permission alone silently leaves valid web
  destinations unopened. Browser verification must confirm the destination tab
  opens as well as confirming that the source page remains mounted.
- Keep fenced Markdown code headers, containers, loading skeletons, controls,
  and line numbers on the shared user-message neutral fill through stable chat
  theme hooks styled in `src/app.css`. Shiki owns highlighted token colors, not
  the surrounding block background; fixed light renderer utilities must never
  remain visible in the dark application theme. A fence without a language
  collapses the empty header and overlays the copy action in the upper-right.
  Expose copy as the only fenced-code action; do not show the renderer's code
  download control. Keep Markdown table headers or row-hover fills on the
  corresponding shared neutral hover/selection fill.
- In responsive double-column mode, expanded process records participate in
  pagination instead of moving as one container. Keep the process header with
  its first record and preserve the same atomic break rules used by ordinary
  assistant content. Keep the completed-turn metadata and action footer outside
  column balancing as one full-width row below both columns. Use an explicit
  button-controlled process group instead of a native `details` element because
  WebView2 can lose toggle hit testing when an interactive element is fragmented
  across CSS columns. Keep collapsed process children mounted so their local UI
  state survives reopening.
- Keep fully mounted transcript rows out of transform-promoted layers. CSS
  multi-column assistant content must not be nested in a forced compositor
  layer because it can flicker during WebView2 repaint invalidation.
- Disable per-record `content-visibility` inside every transcript row in both
  single- and double-column layouts. All historical content remains rendered;
  a skipped record can otherwise replace real content with an intrinsic
  placeholder and move the reader when its height returns. Every multi-column
  owner must apply this override itself; book mode renders through a dialog
  portal and cannot inherit the transcript list's descendant rules. Keep
  pagination recalculation positioning immediate so it cannot compete with the
  smooth animation reserved for an explicit page turn.
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
  Goal or Graph state. A newly created Goal or Graph automatically opens its
  resizable right-side status panel, including flows created by slash commands
  or tools. Selecting an existing flow starts collapsed, while a user's expand
  or collapse choice survives later checkpoints for that same selected flow.
  Keep the single panel toggle at
  the trailing end of the shared title bar, use it for both expansion and collapse,
  and collapse the panel to a zero-width, non-interactive track using the same
  180ms width curve as the conversation sidebar.
  Place the expanded panel
  as a full-height inset card inside the conversation workspace's flex container,
  using the same translucent Mica material as the conversation surface so it stays
  visually continuous while its persisted width reduces the conversation track.
  Paint one neutral translucent Mica background on that shared workspace. Keep
  the composer's bottom readability fade there rather than inside the
  conversation-only track, but do not add an ambient color or streaming glow
  behind the composer. Keep the main conversation workspace shadowless in both
  themes. Give both the ordinary composer and expanded panel the
  same standard Mica card surface and blur without a colored state shadow. Use
  the shared two-layer, short-falloff neutral shadow so the input edge stays
  softly legible without looking like a floating panel.
  Retain the expanded panel's card border, radius, and shadow; its surface must
  use the same composition as the composer rather than an independently tinted
  backdrop. Do not retain a clickable edge peek, collapsed layout track, or a
  second collapse control inside the panel. Keep the expanded header free of
  decorative Goal or Graph kind glyphs. Center an otherwise empty planning state
  in the available panel body.
  Cap the expanded panel to 45% of its live conversation container as well as
  its fixed maximum, so a persisted or dragged width cannot squeeze the main
  conversation into a deformed narrow track. Let Goal cards grow to contain their wrapped task and result copy,
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
- Mount the turn-level process disclosure only after the logical Turn reaches
  the normally completed status, and default it closed. Running, interrupted,
  cancelled, and failed Turns render their records directly in source order,
  without process/final repartitioning or a process header, so pending input
  remains visible without presenting unfinished work as a completed process
  history. When a resumed Turn completes, treat its dedicated `ask_user` input
  as a process boundary so narration emitted before the form cannot move below
  it while the post-resume answer remains final output. Keep the process/final
  partition mounted at one stable template location across that status
  transition: revealing the process disclosure may hide its process children,
  but must not remount final rich output such as Mermaid or HTML previews.
- Treat the first `render_html` or `render_mermaid` call as the process-disclosure
  boundary: keep that render and every later record outside the collapsed work
  details, including later tools and reasoning. Before that boundary,
  `update_goal` behaves like an ordinary tool and remains eligible for grouping
  and process folding. Without a render call, use the ordinary trailing-text
  boundary.
- Treat assistant records separated only by a tagged context-compaction replay
  as one complete Agent reply. Keep the compaction boundary at its real
  position inside that reply, with one action footer after the final record.
  When manual compaction completes, refresh its checkpoint immediately so the
  divider appears without waiting for another user turn. While compaction is in
  flight, keep one localized transient divider mounted and update its checking,
  summarizing, and persistence stages in place. Render a terminal failure with
  the same shared divider in its danger treatment and retain its detail briefly;
  replace successful progress with the durable completion divider only after
  checkpoint reconciliation. Do not show a redundant success toast for the same
  transition.
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
  The remote gateway preference projection must carry the persisted message
  layout, responsive two-column threshold, and book-mode font size so the
  desktop and paired browser render the same transcript reading preferences;
  older remote servers may omit these additive values and the browser must use
  the canonical defaults in that case.
  Fragment Markdown tables between rows instead of treating the whole table as
  one page-sized atom. Keep rich atomic embeds such as images, video, charts,
  Mermaid, code, and HTML previews within the usable page height; preserve
  their native containment or internal scrolling rather than clipping content.
  Recalculate after embedded media loads as well as after resize or expansion.
  Coalesce resize, mutation, and media-load pagination requests into one
  cancellable animation-frame update. Resize observers must never synchronously
  write column geometry or scroll position back to the observed book page, and
  unchanged geometry must not be written again; this prevents WebView2 resize
  feedback from overwhelming the renderer while the native window is dragged.
  Retain the same collapsible process-record grouping instead of flattening or
  dropping work details. When expanded, change the process content from its
  ordinary flex stack to a fragmentable block inside the book's multi-column
  owner, and keep only atomic records from splitting across columns.
- The fully mounted transcript list owns tail following without measuring
  individual rows or issuing per-chunk scroll commands from the route. Observe
  only the list's overall height and pin the scroller to the new bottom while
  following the live tail; after the reader leaves the tail, rely on native
  browser scroll anchoring to preserve their position. Reserve a stable
  scrollbar gutter so overflow changes cannot alter transcript wrapping or
  sidebar row width. The native transcript scrollbar follows the application-wide
  activity treatment: reveal it during scrolling or pointer movement in the
  scroller, then hide its thumb after the shared idle delay without collapsing
  the reserved gutter. The
  application viewport must not become a second scroll container: keep
  `html`/`body` overflow locked and contain transcript overscroll so wheel or
  touch input at either boundary cannot chain into an outer scrollbar. User
  message index navigation targets the already-mounted real row directly.
  Mark ResizeObserver-owned tail pins as programmatic before assigning
  `scrollTop`, so their delayed scroll events cannot disable following between
  streamed fragments. Only reader scroll intent may leave the live tail.
- After completion, reconcile the optimistic turn with its durable checkpoint
  in the background. Do not show the conversation-loading skeleton, remount an
  unchanged transcript, overwrite backend history, or remove optimistic
  messages from a queued turn.
- Preserve messages inserted by live events while any foreground or background
  checkpoint hydration is in flight. If an externally started run reaches its
  first durable checkpoint without a visible user message, reload and reconcile
  that checkpoint so a quick-chat launch cannot render an assistant-only turn
  after missing the lossy run-started event.
- Treat the cross-workspace Recent conversations list as a live projection, not
  only a database refresh result. User submission, externally started runs, and
  terminal stream updates must immediately promote the matching conversation.
  A successful asynchronous Flash title update must update and promote the same
  recent entry even when that conversation is outside the selected workspace's
  loaded page. A slower background refresh must not overwrite a newer optimistic
  title or activity timestamp; keep the list role-filtered, newest-first,
  workspace-owned, deduplicated, and capped at 20 entries.
- Attach Flash-generated follow-up suggestions to the stable preallocated
  backend assistant message ID for the triggering user turn. Cache them by
  message ID across navigation. Resolve that host from the selected Turn's
  `response_message_id`, not from its final assistant checkpoint record, because
  tool rounds can append several assistant records under one Turn. An ask_user
  or approval resume retains that logical Turn response ID while its newly
  appended assistant records keep distinct message IDs; do not re-key or restart
  the already-running suggestion task at the interrupt boundary. Render
  exactly three only below the latest complete reply on the currently selected
  branch after streaming has ended; a newer trailing user message must not
  revive an older turn's suggestions. Send a selected suggestion through the
  shared user-message path without replacing the current composer draft. The
  runtime starts generation when the user message is submitted and supplies
  only all user-authored messages from that selected branch, never Agent output.
- New checkpoints carry compacted context inside the tagged user replay rather
  than adding a system message. Represent the whole record only by the divider,
  while continuing to restore legacy system-boundary checkpoints.

## Tool and interrupt rendering

- Render the standard runtime-interrupted marker as one localized divider title.
  Suppress a persisted or transient reason that only repeats that title, while
  retaining nonstandard interruption details and all runtime-error details.
- Render durable `ask_user` calls with the dedicated input component. A call
  without a ToolResult in an interrupted Turn is waiting; a submitted result is
  answered; the runtime ToolResult added when the user sends a new message
  instead of using the form is unanswered; an explicit form cancellation stays
  cancelled. Preserve those distinctions after streaming, reload, and branch
  switches.
- Derive every tool's visible lifecycle from its matching ToolResult: no result
  is waiting outside an active stream and running during one, ordinary output
  is successful, a runtime patch for a user who continued the conversation is
  unanswered, and explicit denial or run cancellation is cancelled. Hide
  failed tool calls before grouping so neither an individual card nor an empty
  or misleading group appears in live or durable transcripts.
- Project every durable ToolResult content block into the same concise text used
  by live tool events: preserve text, serialize JSON values, and represent image
  results without exposing encoded bytes. Structured tool output must not become
  a successful but blank card after finalization, reload, or branch switching.
- Group consecutive ordinary ToolCalls into one collapsed summary row with
  independently expandable calls.
- Keep ordinary and enhanced file/search tool cards, grouped tool summaries,
  and both pending and completed `ask_user` surfaces on the same compact,
  transparent, neutral-perimeter grammar: one summary row followed by
  independently expandable 32px tool rows with a quiet terminal-status mark.
  Reserve the blue accent for real interaction state such as keyboard focus or
  an actively running tool, not for the tool's type.
- Bound expanded `edit_file` replacement previews by source characters and
  rendered diff rows. Large Agent edits must end with a neutral omission marker
  instead of allocating an unbounded preview or mounting enough transcript DOM
  nodes to terminate the desktop WebView.
- Keep `ask_user`, approvals, HTML previews, and other dedicated tools outside
  ordinary grouping.
- Batched approval cards remain independently clickable. Optimistically resolve
  only the exact request ID that was clicked, reject duplicate responses for
  that same request, and leave sibling cards interactive while the runtime's
  per-conversation queue advances each response from the latest durable tip.
  A live approval request arrives before its run's terminal interruption event;
  if the clicked request still belongs to the live stream, wait for that event
  to finalize the assistant turn before initializing the resumed stream. Never
  clear the text or tool cards that contain the approval being resolved.
  A failed response restores only its matching card and must not tear down a
  sibling approval that is still queued or running. Apply the same behavior to
  desktop and remote transcript projections.
- Render `render_mermaid` as a standalone transcript row from ToolCall source and
  restore it from the matching durable ToolResult. Defer `render_html` and
  `render_mermaid` previews until their successful ToolResult arrives; never
  mount pending or failed render previews. Apply the same failed-result hiding
  rule to ordinary tools.
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
- Keep main-composer model selection, per-model reasoning effort, and approval
  persistence in the composer-preferences controller so queued saves and
  rollback-to-settings behavior remain one boundary rather than page-level
  state spread across render branches. Snapshot reactive configuration before
  cloning it for an approval-mode save, and keep snapshot, optimistic update,
  persistence, and rollback failures inside the queue's handled boundary so a
  failed selection cannot terminate or permanently poison later saves.

## Attachments and editing

- Text selected inside an assistant answer exposes one compact, localized
  `Add to chat` floating action. Adding it creates a structured `quote` context
  tied to the source assistant message, moves focus to the shared composer, and
  leaves the editable draft text unchanged. Render pending quotes above the
  textarea with an explicit remove action; queue, submit, restore, branch edit,
  and remote-gateway flows must preserve the same typed context. Render durable
  quotes above the user-authored message text, shrink their cards to the visible
  excerpt up to the available message width, and keep their provider wrapper out
  of the visible transcript. Pending composer quote rows continue to fill the
  composer width. Preserve selected KaTeX expressions as Markdown math from the
  renderer-owned source wrapper instead of copying its visual layout spans, and
  render that math in pending and durable quote cards.
- Keep pending composer text, attachments, and quoted context isolated by
  conversation while navigating. The new-conversation surface owns a separate
  draft per workspace and role; sending or deleting one conversation must not
  clear another conversation's pending composer state. Write the active reactive
  draft back to its keyed store before swapping the composer to another draft;
  retaining only the pre-proxy source object loses edits made through bindings.
  Synchronize the textarea's measured height on mount, before the first edit,
  and clamp input-driven measurements to its CSS minimum so the first typed
  character cannot resize or move the composer.
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
- Paint durable, editable, and loading-skeleton user-message bubbles with the
  shared `--user-message-bg` token, which maps to the fixed theme-aware
  `--component-neutral-bg` used by assistant-rendered cards. Use that fill for
  every attachment-card variant as well; attachment thumbnails and controls
  must not introduce a white base. Keep user-input cards and summaries in their
  compact transparent grammar, and keep grouped tool calls on the transcript canvas:
  the summary is its own outlined button and
  expanded ordinary tool cards retain transparent backgrounds without a shared
  group background or enclosing perimeter.
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
- Keep reusable interaction and menu presentation in `src/app.css`: the shared
  hover/open/selected control fill, menu rows, search fields, empty states, and
  separators are application primitives. Components own only their dimensions,
  content layout, and semantic exceptions; do not duplicate the shared state
  declarations in component styles.
- Reuse the shared raised-surface geometry for the composer, file-change banner,
  every desktop menu panel, command/mention palettes, floating text-selection
  actions, and notifications so their hairline perimeter, 18px radius, 24px
  saturated blur, and compact, clearly edged elevation stay identical in both
  themes. Floating content uses the dedicated 90%-opaque theme fill so underlying
  text cannot wash out its content; non-floating input surfaces retain the lighter
  Mica fill. This includes model, role,
  workspace, recent-workspace, application, context, combobox, and compact
  download panels. Their
  dimensions, internal spacing, and content behavior remain component-owned;
  explanatory tooltips and modal dialogs retain their distinct semantics.
- Keep the shared application menu fully operable without a pointer. Expose
  platform-appropriate accelerator labels, preserve access-key and arrow-key
  navigation, and route global application shortcuts through the same actions
  as menu selection. Edit owns Undo, Redo, Cut, Copy, Paste, Delete, and Select
  All against the focused editable context; Help owns the shared, state-aware
  application update check. A separate workspace process may be requested only
  through File -> New window. Show WSL workspace-opening actions in the File
  menu and composer workspace switcher only on Windows; native folder opening
  remains available on every desktop platform.
- Render those floating panels through the shared desktop menu surface, which
  consumes the conversation-input material while retaining the shared 6px menu
  inset. Keep component-specific width, height, scrolling, and item content,
  but do not fork its panel material or neutral hover fill.
- Keep selection signaling consistent across floating option rows and persistent
  navigation lists: neutral buttons, triggers, and option rows use the shared
  theme-aware `--interactive-state-bg` for hover, open, and selected states;
  derive it from the current text color at 8% opacity so the fill remains
  visible over canvas, sidebar, and native Mica surfaces. Static conversation
  components instead use `--component-neutral-bg`, with the shadcn neutral
  palette's `#f4f4f5` light fill and `#27272a` dark fill. Selected rows use the
  interaction fill without a decorative left rail, stronger fill, checkmark, or selected text color. GPUI
  preserves the same row geometry, selected fill, selection semantics,
  accessibility state, and interactions. Primary and destructive actions retain
  their semantic state colors.
- Keep the new-conversation composer's workspace switcher beside approval mode
  and focused on open-folder actions. Hide it once an existing workspace-owned
  conversation is active; the Projects section remains the visible workspace
  context, and the title bar must not duplicate it. The File menu and Projects
  section remain the other workspace-opening entry points.
  Keep the current-folder-location action text-only instead of repeating a
  folder glyph beside it.
  Keep the composer trigger's folder glyph, current folder name, and caret in
  one target; rotate the caret while open and expose the shared focus ring to
  keyboard users. Its rest, hover, and open treatments must match the adjacent
  surface-free model and approval triggers instead of introducing a separate
  filled workspace chip, and its folder name must inherit the trigger's stateful
  foreground instead of retaining the title-bar text color. Keep nested composer
  controls free of the generic `composer` class so conversation-surface Mica
  styling cannot turn them into independent raised cards.
  Place older workspaces in a side-opening recent-workspaces submenu that
  supports hover, click, and keyboard navigation. Show each complete workspace
  path without per-row icons, mark WSL shares explicitly, and keep an overflowing
  list's scrollbar flush with the submenu's right edge.
- Keep the composer slash-command and mention palette on the shared compact
  menu row scale and conversation-input material. Align its width to the
  composer, use the shared 18px radius and 6px inset, and let both surfaces
  follow their visible items up to the lesser of the configured 320px maximum
  and the live space above the composer, retaining an 8px viewport inset. Recalculate that space
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
- Prepare current-window workspace switches in the background while keeping the
  mounted sidebar, transcript, and composer visible. Make the existing shell
  inert and busy during that transition, then commit the target workspace
  context, roles, conversation page, and fully hydrated active conversation as
  one state change. Never clear the current workspace first or route workspace
  transition state through the sidebar, transcript, or composer skeletons.
  Retain each visited workspace's conversation transcript snapshot so switching
  away from an active Turn cannot discard its optimistic user message or make a
  terminal event look like it belongs to a deleted conversation. When that
  workspace is revisited during streaming, reconcile its durable checkpoint
  while preserving cached messages that the checkpoint has not yet recorded.
- Derive first-run onboarding visibility from the normalized bootstrap config.
  Persist completion in the versioned config beneath `OPENAGENT_HOME`; migrate
  the legacy WebView-local marker once and remove it only after the durable save
  succeeds.
- Render first-run onboarding in its own undecorated Tauri window while the main
  window remains hidden. Completing the flow hands the selected workspace back
  to the already-bootstrapped main window before revealing it. The development
  inspector reopens that same window without clearing durable completion. On
  Windows, pre-create the centered onboarding WebviewWindow during native setup
  and let it initialize while hidden; revealing it must only unminimize, show,
  and focus that existing top-level window. Do not dynamically construct it from
  a command handler or make visibility depend on frontend readiness or WebView
  window APIs. Completing or dismissing a debug revisit must hide rather than
  destroy the preloaded window so later inspector invocations reuse the same
  initialized instance. Keep its compact title bar free of a visible setup
  label and match the main application chrome height. Keep the onboarding
  canvas fixed at 960 × 640px and omit its maximize affordance. Pair one quiet,
  product-owned setup illustration with compact numbered progress controls in
  the native-material column, then lead directly with the current step's
  display heading inside the inset, borderless content canvas. The welcome step
  must explain the product, summarize the upcoming configuration, and describe
  how the workspace is used before asking a first-time user to continue. Dense
  step content scrolls inside that form column without resizing the window; keep
  its scrollbar flush with the trailing canvas edge while preserving the content
  inset. Separate both columns through spacing and neutral selection fill instead
  of divider lines. The right-side setup canvas and its nested summary cards use
  the same bordered, shadowless Mica surface as grouped Settings cards. Reuse the
  shared Settings action button for ordinary onboarding actions; its secondary
  treatment carries the same restrained divider-colored perimeter as Settings
  inputs, while primary actions remain filled.
  Render a layout-stable loading skeleton until its
  configuration is ready. Keep the development-only `onboarding-preview` query with
  `onboarding-preview-theme=light|dark` and `onboarding-preview-locale=zh|en`
  parameters so the surface remains browser-verifiable without native state.
  Preview every onboarding theme change through the page shell so the WebView
  palette and the native window material switch together instead of compositing
  a dark translucent canvas over a light native backdrop.
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
- Organize the conversation sidebar as Projects followed by Recent conversations,
  with independently collapsible sections. Projects initially expands the current
  workspace with its paged conversation hierarchy and exposes recent workspaces as
  project groups. Clicking any expanded project row collapses its conversation
  hierarchy without changing the selected workspace or unmounting that project's
  keyed list. Clicking a collapsed selected project expands it in place; clicking
  a collapsed project for a different workspace selects that workspace and
  expands its hierarchy. Keep project groups in their
  persisted first-save order when the current workspace changes so keyed rows
  retain their DOM position; pinned
  groups may remain ahead without otherwise reordering either group. Do not cap
  the project group count: startup omits persisted paths whose directories no
  longer exist, recovers every existing workspace represented by durable
  conversations, and rejects a path that disappears before a later switch. Keep
  the same keyed `ConversationList` mounted beneath every project with five
  conversations initially visible. Show more only when loaded conversations remain hidden or
  the current workspace reports another page. Selection may change its
  pagination capability, but every role keeps one per-workspace conversation
  snapshot so changing the selected workspace never swaps a project's list data
  source or discards the previous workspace's keyed rows. Independently load the
  first role-filtered page for every visible inactive project instead of treating
  the bounded global Recent projection as that project's complete history. Keep
  its cached rows mounted while refreshing, show a compact layout-stable skeleton
  before the first project load completes, and use a muted, indented `No chats`
  row without a persistent group background only after an authoritative empty page. Reserve the project
  row's trailing action space at rest so focus, pending selection, and active
  styles never change its geometry. Its focused name search
  ranks exact, prefix, name, and path
  matches ahead of the unchanged remainder instead of hiding unmatched projects.
  Recent conversations is one newest-first projection of the 20 most recently
  updated conversations across workspace metadata for the selected role. Keep
  that projection independent from the selected workspace's conversation page,
  and retain the loaded role snapshot during a same-role background refresh so
  workspace switching only updates keyed rows in place. Keep it in the sidebar's
  ordinary scroll flow without its own scroll container or pagination query.
  Preserve the owning workspace on every global conversation.
  Sidebar conversation search covers every workspace
  and role only while its input retains focus; focus leaving the search control
  clears the query and restores the ordinary sidebar. Selecting any result or
  recent conversation switches the current window to its owning workspace before
  opening that exact conversation.
  Keep project-specific actions on each project row instead of the Projects
  heading: expose a direct new-conversation action plus a compact menu for
  pinning, opening the folder, and removing the project from the project list.
  Let the project-row shell alone paint the shared hover, focus, and selected
  fill while its inner row stays transparent; painting both layers compounds
  the translucent neutral state into a darker gray.
  Project pins are durable sidebar presentation preferences. Removing a project
  must not delete its folder or conversations; its conversations remain
  reachable from Recents. Keep global conversation search with the primary
  new-conversation action below the role selector, not on a section heading.
  Deleting a conversation from any project, Recents-backed snapshot, or global
  search result must carry its owning workspace through the shared callback and
  remove it immediately from every cached sidebar projection; never mutate only
  the currently selected workspace list. Desktop menu action labels are not
  selectable text, while editable fields inside menu panels retain ordinary
  text selection.
- Keep the expanded conversation sidebar resizable from its trailing edge between
  220px and 360px so row labels and trailing actions cannot overlap. Persist the
  chosen width across collapse and reload, keep the default at that lower bound,
  and normalize narrower saved values when they load. Disable width animation
  while dragging, and expose the same bounds to keyboard users.
  Size every project and Recent conversation title from the live space remaining
  in its row, truncate overflow with an ellipsis, and scroll only overflowing copy
  when the pointer rests on the title. Recompute that overflow whenever the
  sidebar or neighboring row controls change width.
  The resize hit target and active indicator begin below the shared title bar so
  a sidebar drag never draws a separator through application chrome.
- Keep the expanded sidebar's role trigger above Projects and size it to its
  visible role name without a redundant caret. Keep the full-width new-conversation
  and global conversation-search actions immediately below it; the new action
  uses the window's selected workspace, while project-row actions may explicitly
  select another workspace first. Retain Settings as the sole bottom navigation
  action. Keep the back and forward
  controls fixed beside the sidebar-collapse button in the shared top chrome.
  On macOS, reserve the native traffic-light footprint before those controls;
  on Windows, keep minimize, maximize/restore, and close at the trailing edge
  with platform-standard hit targets and close affordance. Tie history controls
  to the window's real destination history: conversations, the
  new-conversation surface, and Settings all participate; visiting a new
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
  content gap, a 7px radius, and a 3px parent-owned row gap. Align project-owned
  conversation labels and their show-more action with the project name after its
  folder icon. The workspace role selector at the top of the sidebar remains a
  distinct selector control.
- Paint the sidebar and complete shared title bar with one opaque application-
  chrome background in both themes. Preserve the operating system's native
  window outline, rounded corners, and shadow around that web content. Keep the
  two chrome segments visually continuous without a border between them or
  beneath the title bar. Present chat as its own clipped, rounded canvas directly
  against the title bar's lower edge, with 8px gutters at the sides and bottom
  plus compact, clearly edged elevation; use that spatial layer rather than
  shell divider lines to separate conversation from navigation.
- Use the theme canvas for the workspace surface. Keep the new-conversation
  greeting and composer, as well as the bottom-anchored composer, on neutral
  theme surfaces without an ambient color field or animated glow. On a new
  conversation, treat the greeting and composer as one vertical stack whose
  measured total height is centered with a small fixed offset below the geometric
  center. When no generated suggestions are available, raise that complete stack
  by 24px without positioning the greeting and composer independently. Constrain
  that composer to a 760px outer column. Give its compact
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
  header-sized gap above the first message or debug context. Tint the translucent
  conversation-canvas veil from the shared application background in both themes
  so neutral regions match the title bar. Reserve Mica for raised chat controls
  such as the composer and flow panel.
- An explicitly empty durable active-conversation marker restores the centered
  new-conversation surface, even when older conversations exist. Never fall
  back to the newest conversation.
- Treat the new-conversation action as idempotent while that surface is already
  visible. Do not reload its greeting or suggestions, rewrite its durable active marker,
  or toggle its loading skeleton on a repeated click.
- The new-conversation greeting is the fixed prompt `Where should we start?`
  across desktop, remote, preview, and every locale. Keep it outside the
  localization dictionaries so an immediate locale switch cannot replace it.
  It uses a compact, regular-weight display heading treatment above the
  centered composer. Keep its tracking locale-aware: Latin copy remains subtly
  compact while Chinese copy uses open, positive character spacing. It must not
  depend on memory or a Flash task. Show exactly three optional Flash-generated
  suggestions derived from up to the five most recently updated top-level
  conversation titles, persisted per workspace and locale below the composer.
  Selecting one sends it immediately through the shared user-message path.
- Keep the development-only `follow-up-suggestions-preview` query available
  with `-theme=light|dark` and `-locale=zh|en` parameters so both suggestion
  placements, logical-Turn hosting across multiple assistant records, and their
  direct-send interaction remain browser-verifiable. In
  the centered new-conversation placement, reserve the leading suggestion-icon
  track inside the composer gutter: align the icon with the composer shell and
  the suggestion copy with the textarea copy instead of centering the copy
  without accounting for the icon.
- Keep the right-side user-message index on one shared tooltip surface. Its
  hover and focus treatment may extend the marker line but must not paint a
  gray button background. Do not render a second inline message preview for
  the same index marker.
- Do not render approval controls for a switched branch until its active tip is
  durable.

## Quick chat

- Keep top-level surface dispatch in the route composition root. The dedicated
  Quick Chat surface owns launcher configuration, focus, attachment, submission,
  and settings-reload state; its window service owns sizing, positioning, and
  shortcut registration. Development preview surfaces own their fixtures and
  query-specific theme/locale initialization so preview-only state never joins
  the durable conversation runtime.
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
  comparison of the composer, file-change banner, model and workspace menus,
  and open role-selector panel. Its `-theme` and `-locale` parameters must keep
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
  right-side Goal/Graph checkpoint panel and composer approval selector. Its
  `-kind`, `-theme`, and `-locale` query parameters must keep Goal/Graph,
  resize/collapse, approval selection through the real composer-preferences
  save queue, light/dark, and Chinese/English checks addressable without a
  native runtime. The `-empty` parameter exposes the centered Graph planning
  state directly.
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
  background. Keep provider status text and its switch flat instead of wrapping
  either in an additional gray capsule, and route provider filtering and node
  deletion through the same shared settings-action control as neighboring
  actions.
- Channel ID allowlists use the shared fixed-height settings list input. Keep
  resizing disabled and let long lists scroll vertically inside the control so
  every channel configuration retains the same layout height.

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
