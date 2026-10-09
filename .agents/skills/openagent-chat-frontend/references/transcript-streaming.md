# Transcript and streaming

- Keep the route as the desktop composition and runtime-coordination boundary.
  The permanently expanded desktop sidebar owns its width, resize gesture, and
  conversation navigation chrome; the shared title bar owns application menus,
  sync, and window chrome across chat and Settings. The title bar renders File,
  Edit, and Help only; do not restore the removed Configure menu or its Memory,
  Roles, and Skills management surfaces and shortcuts. Keep its center free of
  workspace names and Git branches so the
  remaining drag region stays visually quiet. The route owns the native
  window-focus state and passes that same value to both top-chrome segments and
  the conversation surface, so the sidebar application icon, role/history row, and
  title-bar content dim and restore together without changing their shared
  native window material or geometry. When that state transitions from inactive
  to active while the conversation composer is mounted, return keyboard focus
  to its enabled editor through the shared composer focus-request channel.
  Treat every native focused callback and explicit desktop-window activation
  event as a distinct request even if no preceding blur callback reached the
  WebView; route that monotonic request through `ConversationSurface` to
  `MessageInput`, and retry after the WebView2 focus handoff, so task switching,
  tray activation, repeated launches, and registered-workspace navigation restore
  DOM focus without a pointer click. On Windows the host must transfer a newly
  activated top-level window into the embedded WebView before sending the
  activation event; the frontend request then owns only the final DOM editor
  focus. A targeted workspace request reissues the
  focus request after its conversation navigation settles so an atomic switch
  cannot leave focus attached to the previously visible composer.
  Keep the ordinary Tauri shell's title bar and sidebar transparent over the
  Rust-owned Mica/Acrylic/Blur or macOS Vibrancy effect. Paint the inset
  conversation stage with the Tailwind `bg-conversation-surface` theme color,
  so the light-theme transcript canvas is consistently white instead of showing
  the gray native material. Keep that canvas distinct from the fixed gray
  component surface used by user messages and other transcript cards. Centralize
  both values in `src/app.css`; do not add another tint or pseudo-element over
  the canvas.
  Linux has no Rust-owned native material, so the route must not add the
  `native-window-material` class on Linux; otherwise the body becomes
  transparent and the WebView's default gray background leaks through the
  shell. On Linux the transparent shell reveals the opaque theme background
  owned by the page while still sharing the same component geometry and
  surface tokens as the other platforms. Content-bearing controls and cards paint
  their own surfaces. Browser chat previews use the same opaque conversation
  surface, and
  the quick-chat transparent stage keeps its separate contract. Serialize
  native theme changes so rapid Settings previews cannot complete out of
  order. Returning to the system theme must clear the native override before
  resolving the WebView media preference, because the previous native override
  can still influence that query.
  The conversation surface owns transcript/composer
  composition, package-flow panel presentation, and chat renderer theme overrides.
  Pass each surface a deliberate view model and action contract instead of
  returning leaf component markup or surface-local layout state to the route.
- Keep transient per-conversation stream maps in the dedicated stream-state
  controller. The page shell coordinates durable conversation/checkpoint data
  with that controller, but must not recreate parallel maps for streaming,
  pause, timing, awaiting-output, or memory-retrieval state.
- Starting, timing, and cleaning up a turn must be scoped to its conversation;
  clearing one conversation's transient maps must preserve every sibling
  conversation's stream, timing, retrieval, and recovery state.
- Treat correlated tool calls, results, and approval requests as idempotent
  stream events. Once an event has attached to its `toolUseId`, a repeated copy
  must leave the transcript unchanged instead of creating a duplicate card or
  falling through to the next pending sibling tool.
- Keep transcript tail-follow intent scoped to the active conversation. The
  shared viewport may be reused when navigating between conversations, but a
  stream's automatic tail pin must not carry over to another conversation.
  Tail following is enabled only while that conversation is streaming; once a
  response is durable, transcript updates must not reposition the reader.
  While following, pin synchronously when streamed DOM content mutates and
  settle again on the next animation frame so a large render batch cannot leave
  the viewport behind before its final layout height is observable.
  User wheel, touch, and pointer scrolling must immediately release tail
  following based on the actual viewport position, even if a programmatic pin
  was scheduled in the same frame.
- Drive awaiting-output from the SDK's model-request lifecycle rather than from
  an empty transcript or a timer. Keep every Rig completion request, including
  follow-up requests after tool results, in the transport's active request state.
  The transcript's logical Turn presentation below decides which waiting or
  running status the user sees; provider rounds do not create new Turn clocks.
- Completed messages and the active response share one keyed, fully mounted
  transcript list. Do not reintroduce viewport virtualization or row-height
  estimation: restored and live rows stay mounted so loading and scrolling do
  not repeatedly construct transcript content or discard row-local UI state.
  When hydrating a conversation, project the selected checkpoint path once and
  reuse it for pending-input restoration, tip inspection, and any history
  handoff; finding the tip alone should use the tree tip node without copying
  the full transcript.
  Resize-driven tail pins must be coalesced to one animation frame so dragging
  the window or panel does not synchronously remeasure a long transcript for
  every observer callback; streamed DOM mutations may still pin immediately.
- Keep ordinary transcript copy and the shared composer editor on the same
  compact 14px type scale so streaming and editable durable content do not
  change apparent size.
- Render the user's own authored message through the composer's inline Markdown
  projection: bold, italic, strikethrough, inline code, and links render with a
  shared `.composer-md` treatment from `src/app.css`. Keep that projection
  inline-only, because block children would break the collapsed message's
  `-webkit-line-clamp`; block syntax stays literal in the bubble. Attachment
  labels render as atomic chips and never as links. The in-place edit control
  remains a plain textarea showing raw Markdown; selecting a rendered bubble
  yields the visible text, so a copied user message no longer carries its markup
  markers.
- Give only the trailing text block of an active streamed response Streamdown's
  gentle word-level fade-in (360ms, ease-out); keep completed and earlier
  blocks static so each chunk does not replay the whole answer. Do not append a
  block cursor to the streamed text; the fade is the only live text affordance.
  Disable that animation under `prefers-reduced-motion`.
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
- Use the backend-preallocated assistant message ID as the live row key. In
  debug mode, show the pending checkpoint ID on the trailing live text as soon
  as Runtime emits it; use the durable assistant checkpoint ID after the turn
  is reconciled.
  Debug mode is the persisted main-window preference exposed from Help in both
  development and production builds. It defaults on in development and off in
  production, only controls these transcript debug markers, and does not
  enable the development inspector or debug APIs.
  Streaming and durable forms must share the same assistant-turn branch and
  keyed stream-item children.
- Re-execution fork markers are one-shot state for the submitted turn. Clear
  them on every terminal path, including a cancelled or empty stream that has
  no visible assistant record to attach; the next ordinary message must extend
  the selected branch rather than create an unintended sibling.
- Reduce logical Turn metadata from checkpoints on the selected branch and
  attach it to the backend-preallocated response message. A tool interrupt and
  its resume keep that Turn key; only terminal Turn states expose final timing,
  regenerate, copy, and book-mode actions. Before the first observable model
  response, show the thinking status (memory retrieval retains its own status).
  Once non-empty text, thinking, or a tool call arrives, show a non-interactive
  `ProcessRecordGroup` header above the live records with localized running copy
  and a once-per-second elapsed timer. Reuse the completed disclosure's typography
  and divider without a chevron or collapse behavior; live records remain visible.
  Later provider rounds must never append another thinking status. Use the
  transport's conversation-scoped start timestamp, with durable Turn metadata
  or the authored user timestamp for paired clients; switching conversations
  must not restart the clock. Dispose the interval at completion or unmount.
  Completed turns retain their collapsed process disclosure; cancelled/failed
  turns retain visible records without a live timer. Verify these transitions
  with `bun run test:blackbox:runtime-status` against an isolated debug window
  in light/dark and English/Chinese. Treat the compatibility field
  `first_token_at` as the first observable model response, not only the first
  text token: non-empty text, thinking, or a tool call starts it, while stream
  connection alone does not. Keep the transient stream timer and durable
  checkpoint metadata aligned to that definition. Ignore typed `memory` user
  content in every ordinary transcript, index, edit, copy, and book projection.
  Keep the desktop shell at the same `1040px` minimum width enforced by the
  native main window so the sidebar and conversation composer cannot be
  compressed into unusable tracks. When a transcript footer is narrower than
  its action and metadata content, keep regenerate/copy/book controls as
  non-shrinking single-line buttons and wrap timing, cache, and timestamp
  metadata onto additional lines instead of allowing labels to break into
  vertical glyphs. Composer toolbar selectors follow the same rule: labels stay
  on one line with ellipsis, while the toolbar may grow by wrapping controls.
- Treat the selected branch tip's durable checkpoint as final plugin Flow
  authority, not transient conversation badges. During streaming, project the
  complete package-owned projection carried by `plugin-flow-updated` after
  every package state update; new live events always use `kind: "plugin"` and
  keep that overlay until the matching persisted `chat-checkpoint` is
  reconciled. Index the overlay by the conversation and its `branch_id`, and
  carry the same branch ID on lifecycle checkpoint events, so a sibling
  branch's update cannot replace or clear the selected branch's panel.
  Leave optimistic transcript records mounted throughout and ignore stale
  asynchronous refreshes so an older checkpoint cannot replace a newer live
  package state. When a package flow or branch-scoped file change is observable,
  the resizable right-side conversation-details panel owns that content in the
  ordinary desktop conversation; those file changes must not render above the
  composer. Completed and unsuccessful package states remain inspectable. Only
  when no flow or file change exists may the panel host, its layout region, and
  its title-bar entry be omitted completely. Keep live
  file changes visible through terminal reconciliation until the matching durable
  records are observable on the selected checkpoint path; database visibility alone
  is not sufficient. Reconcile again when checkpoint hydration advances, and ensure a
  successful but stale refresh cannot remove the Files entry or its title-bar
  toggle while file changes remain observable. Its
  top-level Status and Files tabs preserve one
  full-height body, and the Files page uses horizontally scrollable file tabs
  with one line-numbered diff and revert action for the selected file. Keep the
  title-bar toggle and collapsible panel host available whenever any package
  flow or file-change data is currently observable. A temporary empty file projection
  must not hide the panel while its matching live changes are still awaiting
  durable reconciliation.
  Keep diff rows on a single monospace baseline with fixed line-number gutters
  and a dedicated change-marker gutter; pure additions or deletions collapse to
  one line-number gutter, while mixed edits retain dual gutters. The diff viewport
  owns horizontal scrolling for long source lines so indentation and code columns
  stay intact.
  Render a newly created text file from its stored content as all-added
  lines, and keep the path, change kind, and revert action from overlapping as
  the panel width changes. A newly
  created package flow automatically opens the panel, including flows created by
  plugin commands or tools. File-only activity also opens it so removing the
  composer banner does not hide new edits. Selecting an existing flow preserves
  the user's saved expand or collapse choice, and later checkpoints for that
  selected flow must not reset it.
  Persist the user's explicit panel choice and its width across reloads, while
  an automatic open stays session state for the conversation branch it
  happened in and never becomes the default for a branch the session has not
  visited. An availability collapse is drawn, not chosen: it leaves the branch's
  own request intact, so when one of its views has content again the branch the
  user had expanded reopens without another click. Newly created package or file
  activity may still open it. Keep
  the single panel toggle at the trailing end of the shared title bar, use it
  for both expansion and collapse, and collapse the panel to a zero-width,
  non-interactive track using the same 180ms width curve as the conversation
  sidebar.
  Keep the conversation expansion control immediately before the right-sidebar
  control in the shared title bar. Dragging the right details panel until the
  conversation track has only 180px remaining collapses the middle surface and
  lets the details panel occupy the workspace; the conversation control remains
  available so the middle surface can be restored.
  When the conversation container changes width, preserve the user's panel
  proportion before applying the existing 62% container cap and 260px/960px
  bounds; the stored value remains the last concrete width for reloads.
  The status panel header uses the package projection's title and objective,
  plus a right-aligned completed/total count for the common `items` list. Keep
  package status strings visible on each item and preserve unknown vocabulary;
  dependency graphs, reducers, and child scheduling belong to the package that
  emitted the projection.
  Place the expanded panel as a full-height card beside the conversation card in
  the workspace flex container. Keep a narrow transparent gap between these two
  sibling cards while its persisted width reduces the conversation track. Give
  both cards the same radius and neutral surface, with no perimeter border or shadow.
  Center the details-panel resize indicator and its hit target in that transparent
  gap. Place the application-sidebar resize indicator on the conversation card's
  leading edge, with both indicators sharing the same width, interaction opacity,
  and vertical extent below the title bar.
  Keep the details panel surface opaque even when the surrounding conversation canvas
  uses native material, so workspace content never shows through it. Do not
  place a readability fade, ambient color, or streaming glow behind the
  composer. Keep the main conversation
  workspace shadowless in both themes. Give the ordinary composer the standard Mica card surface and blur
  without a colored state shadow. Use
  the ordinary composer a low-contrast neutral hairline and a two-layer,
  short-falloff neutral shadow so its edge stays softly legible without looking
  like a floating panel. Keep that perimeter quieter than floating menus in both
  themes without weakening the shared elevation of other input surfaces.
  Do not retain a clickable edge peek, collapsed layout track, or a
  second collapse control inside the panel. Keep the expanded header free of
  decorative package-kind glyphs. Center an otherwise empty package state
  in the available panel body.
  Cap the expanded panel to 45% of its live conversation container as well as
  its fixed maximum, so a persisted or dragged width cannot squeeze the main
  conversation into a deformed narrow track. Let package items grow to contain
  wrapped labels and details, and keep package summaries inside the panel without
  widening its layout track or introducing horizontal scrolling. Match the
  conversation sidebar's direct manipulation behavior: capture the active
  pointer, disable width transitions and text selection while dragging, and
  restore them when the drag ends or is cancelled. Use the same resizer visual
  geometry as that sidebar: an 8px transparent hit target with a centered 2px
  primary indicator at the same hover, focus, and active opacity. Clear focus
  acquired by a pointer drag when it finishes so the active affordance cannot
  stick; preserve visible focus for keyboard resizing.
- Finalization updates the existing row instead of replacing its DOM subtree.
  Restored historical thinking starts collapsed.
- Thinking starts collapsed in every turn state and expands only on a reader
  click. Its header shows the localized label and latest non-empty content line
  in one row, updates partial lines as chunks arrive, and truncates overflow
  with an ellipsis. Trailing blank lines retain the preceding non-empty line;
  empty content uses the label alone. Expanded thinking shows the complete plain
  text. Strip only a leading `analysis:` or `reasoning:` label from both views.
  New chunks, following records, interruption, resume, and finalization must not
  automatically expand thinking. Reader toggles own the mounted record state;
  remove stream-to-durable auto-open handoff state. Collapsed thinking reserves
  a single-row intrinsic size rather than a full message placeholder.
  Run `bun run test:blackbox:thinking-preview` against an isolated Tauri window
  with explicit `TAURI_PILOT_SOCKET`; the deterministic streaming preview covers
  partial/blank/long lines, click and keyboard disclosure, following text,
  interrupted/resumed and completed turns in light/dark and English/Chinese.
- Keep every failed model attempt as its own ordered retry record and divider
  inside the same logical assistant turn. The turn-level process disclosure may
  contain several retries because automatic recovery must still produce one
  final Agent reply; never merge one attempt's nested stream items into another.
  Persist each retry record as a UI-only checkpoint message immediately after
  restoring the failed request boundary. A later success, terminal failure, or
  cancellation during the retry delay must restore the same attempt output,
  model, ordinal, and error without projecting that display record to a model.
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
  but must not remount final rich output such as Mermaid previews.
- Treat the first `render_mermaid` call as the process-disclosure
  boundary: keep that render and every later record outside the collapsed work
  details, including later tools and reasoning. Before that boundary,
  package progress tools behave like ordinary tools and remain eligible for
  grouping and process folding. Without a render call, use the ordinary
  trailing-text boundary.
- Treat assistant records separated only by a tagged context-compaction replay
  as one complete Agent reply. Keep the compaction boundary at its real
  position inside that reply, with one action footer after the final record.
  When manual compaction completes, refresh its checkpoint immediately so the
  divider appears without waiting for another user turn. While compaction is in
  flight, keep one localized transient divider mounted and update its checking,
  summarizing, and persistence stages in place. Render a terminal failure with
  the same shared divider in its danger treatment and retain its detail briefly.
  On success, convert that same transient record into the completion divider in
  place and leave it mounted for the rest of the streaming turn, because the
  replay that revision produced has no durable continuation yet. Keep it out of
  a later retry record so a failed attempt cannot hide a boundary that already
  happened, and drop it when the optimistic turn is persisted so exactly one
  divider renders. A replay that subsequently reaches the transcript without a
  durable continuation is that same boundary and yields to the live marker while
  the stream still reports compaction; a replay grouped with a durable
  continuation, or any replay while the running turn reports no compaction,
  keeps its divider mounted instead of waiting for the stream to end. Keep the
  composer context usage indicator mounted for the same interval, reporting the
  newest usage measured on the active checkpoint path. Refresh persisted usage
  when a stream starts so the composer can show the last known context size
  before the new checkpoint is available. Consume the typed `chat-model-usage`
  event emitted by each Rig `ModelTurnFinished` hook so every provider request,
  including tool-follow-up rounds, updates the indicator before the overall
  Agent turn ends. Keep the persisted usage refresh as the restore and
  event-loss fallback, then pick up the final measurement when that checkpoint
  arrives. When no prior measurement exists, keep the enabled
  streaming indicator mounted at zero until a usage measurement arrives. Do not
  show a redundant success toast for the same transition.
- Treat the context indicator as a request-size measurement, not a turn-total
  counter. The runtime's aggregate usage is retained for cache and cost
  summaries, while `context_tokens` records the latest provider request's full
  input context, including cached tokens. This follows Codex's
  `last_token_usage` behavior for tool-follow-up rounds and keeps the indicator
  aligned with the provider's context-window denominator. Checkpoint data from
  before `context_tokens` was added uses the existing derived-input fallback.
  Do not show a reply's actions—including regenerate, copy, and book mode—while
  that logical assistant turn is streaming, even when a durable prefix exists
  before a live context-compaction continuation. Keep already completed turns'
  action footers mounted while a later turn streams. Reveal the live turn's
  actions together only after its complete Agent reply finishes.
  A durable turn opened by a package wake prompt may publish its answer through
  a package-owned surface, so the package's visibility policy controls whether
  the normal completion footer and follow-up suggestions appear.
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
  Mermaid and code previews within the usable page height; preserve
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
  browser scroll anchoring to preserve their position. Desktop and remote
  transcript viewports use the shared `ui/ScrollArea.svelte` wrapper, which
  owns the reserved trailing gutter and transient Bits UI scrollbar; do not add
  a second native scrollbar or per-surface thumb styling. Restrict the overlaid composer area's pointer hit testing
  to its rendered controls; transparent layout padding must pass pointer input
  through so the shared scrollbar remains draggable beside the composer. The
  application viewport must not become a second scroll container: keep
  `html`/`body` overflow locked and contain transcript overscroll so wheel or
  touch input at either boundary cannot chain into an outer scrollbar. User
  message index navigation targets the already-mounted real row directly,
  stays fixed on the transcript's left edge, and uses message content alone in
  its hover label so the numeric position is not repeated in a floating
  tooltip.
  Mark ResizeObserver-owned tail pins as programmatic before assigning
  `scrollTop`, so their delayed scroll events cannot disable following between
  streamed fragments. Only reader scroll intent may leave the live tail.
- After completion, reconcile the optimistic turn with its durable checkpoint
  in the background. Do not show the conversation-loading skeleton, remount an
  unchanged transcript, overwrite backend history, or remove optimistic
  messages from a queued turn.
- Terminal events identify both the current streamed assistant record and the
  stable logical Turn response. Ignore a terminal event for an older stream,
  and when its Turn is already present from checkpoint hydration, reuse that
  durable projection instead of appending the finalized live records again.
  Complete this reconciliation before dispatching the next queued message.
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
- Preserve namespaced `plugin_tags` on hydrated checkpoint records. Runtime
  audience policy is authoritative: hide plugin-only model messages from the
  transcript, retain user-visible plugin lifecycle messages as ordinary
  assistant rows, and keep both projections aligned by checkpoint message ID.
  Legacy product tags use this same namespaced projection; do not add a
  frontend allowlist for package tags. The Runtime-only `terminal_poll` control
  tag and provider-only `terminal_wake` user records remain hidden separately.
  External `chat-run-started` events with `user_visible=false` initialize the
  Agent stream without inserting a user bubble, including after hydration.
  Never use an empty display message as the visibility signal; ordinary empty
  user input and hidden control input retain distinct contracts. Terminal wake
  Agent output remains visible. Older checkpoints are normalized by Runtime
  before hydration. Verify terminal wake delivery with
  `bun run test:blackbox:terminal-hooks` against an isolated Tauri instance;
  the scenario covers live hiding, reload, nonmatching output, and
  Stop suppression across light/dark and English/Chinese passes.
  A package that exposes its own transcript surface owns
  sender, wake-target, and mention rendering in that surface; the main
  transcript only renders the host's generic plugin message projection.
