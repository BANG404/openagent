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
- For a successful `write_file`, derive both the collapsed result badge and the
  expanded metadata count from the complete `content` argument. The tool's
  typically single-line success message is status output, not the number of
  lines written.
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
- Return a Mermaid renderer result through the shared SDK client with the
  request's owning conversation ID. The production Runtime is routed and
  cannot resolve a direct interrupt response from its request ID alone.
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
