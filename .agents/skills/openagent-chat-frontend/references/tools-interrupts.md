# Tool and interrupt rendering

- Render the standard runtime-interrupted marker as one localized divider title.
  Suppress a persisted or transient reason that only repeats that title, while
  retaining nonstandard interruption details and all runtime-error details.
- Render durable `ask_user` calls with the dedicated input component. A call
  without a ToolResult in an interrupted Turn is waiting; a submitted result is
  answered; the runtime ToolResult added when the user sends a new message
  instead of using the form is unanswered; an explicit form cancellation stays
  cancelled. Preserve those distinctions after streaming, reload, and branch
  switches.
- Treat only schema-valid `ask_user` calls as form requests. Keep malformed or
  failed `ask_user` calls in durable checkpoint history for provider recovery,
  but hide them from the product transcript instead of showing an empty or
  answered form summary. Apply this rule during both live projection and
  checkpoint hydration.
- Derive every tool's visible lifecycle from its matching ToolResult: no result
  is waiting outside an active stream and running during one, ordinary output
  is successful, a runtime patch for a user who continued the conversation is
  unanswered, and explicit denial or run cancellation is cancelled. Hide
  failed render previews. Ordinary failed tools stay visible with their error
  result and failed status, including missing-tool and approved-call failures;
  receiving a ToolResult alone does not establish success.
- Project every durable ToolResult content block into the same concise text used
  by live tool events: preserve text, serialize JSON values, and represent image
  results without exposing encoded bytes. Structured tool output must not become
  a successful but blank card after finalization, reload, or branch switching.
  The Runtime may append model context to the same result — automation-hook
  output and plugin context arrive as extra content blocks — so the joined text
  is `<json>` followed by that context, not one JSON value. Every reader that
  needs the structured result parses the leading JSON value through
  `src/lib/toolResultJson.ts` instead of the whole string; a result that starts
  with an object or array is structured, and plain text stays plain text.
  Appended context must not turn a failed result into a successful one, nor
  hide a structured result a feature already depends on.
- `view_image` ToolResult image blocks remain image content during checkpoint
  hydration. Render bounded previews in the expanded card without exposing encoded
  bytes.
- Give `exec_command`, `write_stdin`, `edit_file`, and `view_image` distinct call
  and result regions. Terminal headers show the command; only an inspected file
  path earns the path chip, header hint, and open-folder action. Working directories
  remain terminal context.
- `edit_file` renders the current JSON `edits` array of `old_text` / `new_text`
  replacements. Keep path and replacement/addition/removal counts visible while
  collapsed; expand submitted fragments through the shared bounded FileDiffView.
  Fragment offsets are unknown, so never invent complete-file line numbers.
  The submitted preview is not proof of success: retain waiting, running, denied,
  and failed states and show the matching result separately.
- Built-in `apply_patch` is removed from Runtime. Saved calls remain ordinary
  readable records; do not register or recreate an executable patch tool.
- Argument hints prefer path/command scalar values and never stringify objects
  or arrays. Share the same hint projection across grouped, streamed, restored,
  and retry tool cards; unknown MCP tool names remain readable as supplied.
- Group consecutive ordinary ToolCalls into one collapsed summary row with
  independently expandable calls.
  MCP UI tools are standalone presentation records from their first invocation
  metadata through terminal reconciliation, including pending and failed calls.
  Keep them outside tool groups and the completed process disclosure. Exercise
  this boundary with `bun run test:blackbox:mcp-ui-transcript`: it loads the
  independent Mermaid package's real offline resource and checks streaming,
  completion, failure, iframe identity, reload, both themes and both locales.
  MCP App size requests stay inside the transcript width and the inline height
  limit. Fullscreen and PIP promote the existing frame to the browser top layer
  without reparenting its iframe: overflow, containment, the composer and sidebars
  must not constrain or cover it. Host close controls and Escape return inline;
  app modals occupy a higher top-layer surface. Notify actual container width
  changes through host context after layout, without remounting or losing edits.
  The transcript runner also exercises the real editor controls, extreme size
  requests, tall/wide fitting and scrolling, fullscreen/PIP bounds, modal hit
  testing, live appearance, narrow containers, error/empty recovery and local
  edits across terminal reconciliation. Its test-only widget probe communicates
  over postMessage; keep production opaque-origin sandboxing intact.
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
- For a successful `write_file`, derive both the collapsed result badge and the
  expanded metadata count from the complete `content` argument. The tool's
  typically single-line success message is status output, not the number of
  lines written.
- Keep `ask_user`, approvals, Mermaid previews, and other dedicated tools
  outside ordinary grouping. Historical `render_web` calls are ordinary tool
  records; never mount their HTML or URL in the transcript. AGUI `Html(...)`
  is unsupported and renders through the ordinary unknown-component fallback.
  Do not restore HTML-preview configuration, transport operations, asset
  protocols, or a general-purpose browser sidebar.
- Batched approval cards remain independently clickable. Optimistically resolve
  only the exact request ID that was clicked, reject duplicate responses for
  that same request, and leave sibling cards interactive while the runtime's
  per-conversation queue advances each response from the latest durable tip.
  While that queue is non-empty, retain the newest `chat-checkpoint` ID without
  rehydrating the transcript; refresh the selected durable tip once the queue
  drains so intermediate snapshots cannot replace still-pending optimistic
  cards.
  A live approval request arrives before its run's terminal interruption event;
  if the clicked request still belongs to the live stream, wait for that event
  to finalize its assistant record before initializing the resumed stream. Never
  clear the text or tool cards that contain the approval being resolved.
  A failed response restores only its matching card and must not tear down a
  sibling approval that is still queued or running. Apply the same behavior to
  desktop and remote transcript projections.
  `ask_user` answers/cancellations and approval allow/deny responses all continue
  the same logical Turn, following the row and timing rules in
  [transcript and streaming](transcript-streaming.md). A new authored message starts a
  new Turn; its existing durable unanswered/denied result rules still apply.
  Shared approval cards submit both decisions through the answer callback with
  `values.approved` set to a boolean. Reserve `{ cancelled: true }` for cancelling
  an `ask_user` form; the approval endpoint rejects that form-cancellation shape.
  Run `bun run test:blackbox:interrupt-turn` against an isolated native instance
  to verify question answer/cancel, batched approvals, allow/deny, preserved
  record identity and waiting/terminal reload in all four themes/locales.
- Default diagrams use reply-text AGUI `Mermaid(source: "...", title?: "...")`
  through Streamdown's CustomToken dispatcher and the shared Mermaid renderer.
  Triple-quoted multiline source is allowed. Unfinished components show a
  skeleton; complete components render from text during streaming, finalization,
  checkpoint reload and remote viewing. Invalid source stays inspectable with a
  render error. No renderer result is submitted to Runtime and no diagram
  interrupt is restored. Optional editable diagrams belong to the independent
  Mermaid MCP Apps package and use the generic successful-result/approval gate.
  Historical successful `render_mermaid` records remain readable previews;
  pending history must not automatically execute a removed tool.
  All host diagram paths use the resolved semantic palette, explicit Mermaid
  `darkMode`, matching card text, and themed ER attribute rows. Never leave
  Mermaid's white attribute-row defaults under dark text settings. Run
  `bun run test:blackbox:mermaid-themes` with an isolated `mermaid-theme` home,
  explicit Pilot socket and verified Windows main HWND. It installs all ten
  collection packages and checks built-in plus installed themes, light/dark and
  English/Chinese, across Markdown, AGUI, historical tool previews and the real
  offline plugin resource. Six diagram families cover text/background contrast,
  ER rows, live switching, editor identity/edits and error recovery; evidence
  stays in the printed temporary directory.
  Keep other unresolved calls' approval lifecycle and optimistic sibling
  resolutions keyed by request ID. Only the first pending call in execution
  order awaits input; later siblings stay hidden until Runtime advances.
  Keep Mermaid renders serialized behind the underlying operation so the
  shared engine is never used concurrently. The shared renderer must also
  enforce a finite per-render timeout so a pathological diagram cannot block
  the queue and make later tool calls appear to time out. Streamed Mermaid
  source is debounced before rendering, and a newer source invalidates any
  older in-flight result. Capture source dependencies before the debounce so
  source updates actually schedule a render. Renderer palette observers compare
  resolved colors and font before notifying: unrelated or equivalent root
  class/style mutations must preserve the SVG and the user's pan/zoom, including
  fullscreen. Actual palette changes still repaint. Verify embedded/fullscreen
  zoom, fit, palette refresh, finalization and reload in light/dark and English/
  Chinese with `bun run test:blackbox:mermaid-zoom` in an isolated Tauri window.
  Compare Streamdown's reconstructed Mermaid configuration by value before
  scheduling a render. A parent conversation-view refresh with identical
  source, configuration and palette must retain the existing SVG and view.
  `bun run test:blackbox:transcript-refresh` covers actual queue polling in the
  normal chat shell, including fullscreen and restored history.
  The main chat shell preloads the Mermaid module alongside startup without
  delaying the usable conversation shell; a failed preload remains retryable.
- Keep status, file changes, background terminals, and package sidebar views in
  the same resizable desktop right sidebar. Show the sidebar and its title-bar
  entry only while at least one of those views has content. A package view is
  available only after its own validated scope projection is present; pending,
  failed, or ID-less tool calls must not open the panel or make it available.
  Collapse it when the last available view becomes empty. Make that rule structural rather than dependent on effect
  ordering: the rendered collapse state is the active branch's own request
  projected against availability, so no scope switch, restore, or automatic
  open can leave an expanded panel with nothing to show — which would also be
  unclosable, since the title-bar entry disappears with the same views. In
  compact windows, overlay the sidebar across the usable
  application body instead of shrinking the transcript and sidebar content.
  The right sidebar does not embed a general-purpose website browser.
- Present background terminal sessions as an accordion. The right-sidebar
  navigation owns the visible terminal title; the terminal toolbar contains only the running count and Refresh,
  while the panel retains its localized accessible name. Verify this single
  visible title and refresh behavior in the terminal-history black-box scenario.
  Each session row is a command record projected from both the selected branch's
  durable transcript
  and the Runtime's live session list. Restore saved `exec_command` and
  `write_stdin` observations using their `terminal_poll` metadata, including the
  metadata session ID on completed commands. Merge by session ID with the live
  session authoritative; history must keep the terminal tab and title-bar
  entry available after a WebView refresh or Runtime restart. Saved running
  observations without a live session are disconnected history, never proof
  of a running process. Display saved output with a localized history notice
  and no input/stop controls. Deduplicate hydrated/live observations and combine
  distinct incremental polls. Scope summary counts to the conversation branch
  so a previous branch cannot temporarily make an empty sidebar available.
  Start `bun tauri dev --multi-instance terminal-history`, then run
  `bun run test:blackbox:terminal-history` with that instance's pilot socket.
  It verifies disconnected output, unique session rows, controls, collapse,
  reopen, and reload in light/dark and Chinese/English without a provider.
  On Windows, set `BLACKBOX_NATIVE_WINDOW_HANDLE` to the isolated main window's
  HWND to capture native screenshots alongside each WebView screenshot.
  Each session row is a
  disclosure heading with its command, working directory, time, and status;
  expanding a row reveals that session's live output and controls inline,
  collapsing it leaves the other session headings available. Keep one expanded
  session at a time and preserve polling/input/stop behavior while switching
  or collapsing rows. The Runtime attributes every session it starts to the
  conversation and branch that owned the turn, and the panel shows only the
  active conversation branch's own sessions. Retain the selected session,
  expanded row, and output cursor independently for each conversation branch
  so switching branches cannot overwrite another branch's terminal panel
  record, and reset the panel to an empty scope instead of leaving the previous
  scope's sessions on screen until the next poll. Apply the same per-branch
  retention to every right-sidebar view: the selected tab and the branch's own
  collapse request are part of the scope, not app-global state. Each tab's own
  UI state follows the same rule: restore the last selected file, package view
  state, selected terminal session, expanded terminal row, and
  terminal output cursor when that conversation branch returns. Do not reset
  tab-local state merely because a tab was conditionally unmounted; discard it
  only when its backing item no longer exists. A session whose
  owning branch is unknown — a background package run, or any caller with no
  branch context — stays visible in every branch of its conversation, because
  hiding a running process would make it unreachable; only a session that
  positively belongs to another conversation or another branch is hidden. This
  panel's buttons keep
  their resting size on press instead of using the system-wide
  `transform: scale(0.95)`, because scaling a control inside the accordion
  reshuffles the row under the pointer.
- During an active stream, the empty composer's primary action pauses output;
  once paused it resumes output, unless a draft or attachment is present, in
  which case it remains the send action. Sending a queued follow-up from the
  paused state resumes the current stream so queue dispatch cannot deadlock.
  Keep stop as a separate terminal action and clear transient pause state on
  every terminal path and conversation switch. Stop pauses the durable input
  queue and preserves earlier waiting inputs; a cancelled turn must not dispatch
  its next queued message. Follow the conversation UI owner's input-queue
  boundary for new sends after execution ends.
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
