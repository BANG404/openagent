# Transcript and streaming

- Keep the route as the desktop composition and runtime-coordination boundary.
  The desktop sidebar owns its width, resize gesture, collapse persistence, and
  conversation navigation chrome; the shared title bar owns application menus,
  sync, and window chrome across chat and Settings. The title bar renders File,
  Edit, and Help only; do not restore the removed Configure menu or its Memory,
  Roles, and Skills management surfaces and shortcuts. Keep its center free of
  workspace names and Git branches so the
  remaining drag region stays visually quiet. The route owns the native
  window-focus state and passes that same value to both top-chrome segments and
  the conversation surface, so the sidebar collapse/history controls and
  title-bar content dim and restore together without changing their shared
  native window material or geometry. When that state transitions from inactive
  to active while the conversation composer is mounted, return keyboard focus
  to its enabled textarea through the shared composer focus-request channel.
  Treat every native focused callback and explicit desktop-window activation
  event as a distinct request even if no preceding blur callback reached the
  WebView; route that monotonic request through `ConversationSurface` to
  `MessageInput`, and retry after the WebView2 focus handoff, so task switching,
  tray activation, repeated launches, and registered-workspace navigation restore
  DOM focus without a pointer click. On Windows the host must transfer a newly
  activated top-level window into the embedded WebView before sending the
  activation event; the frontend request then owns only the final DOM textarea
  focus. A targeted workspace request reissues the
  focus request after its conversation navigation settles so an atomic switch
  cannot leave focus attached to the previously visible composer.
  The ordinary Tauri shell must keep its
  WebView, shared chrome, feature canvases, and conversation workspace at one
  consistent 30%-opaque theme tint over the Rust-owned Mica/Acrylic/Blur or
  macOS Vibrancy effect, leaving roughly 70% of the native material visible.
  Linux has no Rust-owned native material, so the route must not add the
  `native-window-material` class on Linux; otherwise the body becomes
  transparent and the WebView's default gray background leaks through the
  tinted chrome. On Linux the chrome and canvas keep the opaque theme
  background while still sharing the same component geometry and surface
  tokens as the other platforms. Content-bearing controls and cards paint
  their own surfaces. Browser previews retain the opaque theme canvas, and
  the quick-chat transparent stage keeps its separate contract. Serialize
  native theme changes so rapid Settings previews cannot complete out of
  order. Returning to the system theme must clear the native override before
  resolving the WebView media preference, because the previous native override
  can still influence that query.
  The conversation surface owns transcript/composer
  composition, Goal/Graph panel presentation, and chat renderer theme overrides.
  Pass each surface a deliberate view model and action contract instead of
  returning leaf component markup or surface-local layout state to the route.
- Keep transient per-conversation stream maps in the dedicated stream-state
  controller. The page shell coordinates durable conversation/checkpoint data
  with that controller, but must not recreate parallel maps for streaming,
  pause, timing, awaiting-output, or memory-retrieval state.
- Drive awaiting-output from the SDK's model-request lifecycle rather than from
  an empty transcript. Every Rig completion request, including a follow-up
  request after tool results, starts the delayed thinking indicator; the first
  observable text, reasoning, or tool call clears it. Earlier records in the
  same logical turn must not suppress the indicator for a later agent-loop
  request.
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
  regenerate, copy, and book-mode actions. Treat the compatibility field
  `first_token_at` as the first observable model response, not only the first
  text token: non-empty text, thinking, or a tool call starts it, while stream
  connection alone does not. Keep the transient stream timer and durable
  checkpoint metadata aligned to that definition. Ignore typed `memory` user
  content in every ordinary transcript, index, edit, copy, and book projection.
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
  Place the expanded panel as a full-height card beside the conversation card in
  the workspace flex container. Keep a narrow transparent gap between these two
  sibling cards while its persisted width reduces the conversation track. Give
  both cards the same radius and neutral surface, with no perimeter border or shadow.
  Keep the status panel surface opaque even when the surrounding conversation canvas
  uses native material, so workspace content never shows through it. Keep the
  composer's bottom readability fade inside the conversation card, but do not add an
  ambient color or streaming glow behind the composer. Keep the main conversation
  workspace shadowless in both themes. Give the ordinary composer the standard Mica card surface and blur
  without a colored state shadow. Use
  the ordinary composer a low-contrast neutral hairline and a two-layer,
  short-falloff neutral shadow so its edge stays softly legible without looking
  like a floating panel. Keep that perimeter quieter than floating menus in both
  themes without weakening the shared elevation of other input surfaces.
  Do not retain a clickable edge peek, collapsed layout track, or a
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
  Do not show a reply's actions—including regenerate, copy, and book mode—while
  that logical assistant turn is streaming, even when a durable prefix exists
  before a live context-compaction continuation. Keep already completed turns'
  action footers mounted while a later turn streams. Reveal the live turn's
  actions together only after its complete Agent reply finishes.
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
  backend assistant message ID for the triggering user turn. Restore them from
  the durable renderable-checkpoint projection and merge live events by message
  ID; WebView-local storage is not a persistence source. Resolve that host from
  the selected Turn's `response_message_id`, not from its final assistant
  checkpoint record, because
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
