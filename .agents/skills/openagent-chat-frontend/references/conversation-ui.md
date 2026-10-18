# Conversation components

Expanded file changes show content directly below the file header without a
branch-inference caption or an empty toolbar. Only incomplete projections show
the localized fragment notice above their content.

ConversationSurface shows Scroll to bottom only for a measurable viewport with
more than 24px of vertical overflow and more than 24px remaining below it.
Observe both the viewport and messages-content sizes: streaming, tool disclosure,
history replacement and loading transitions can change content height without
resizing or scrolling the viewport. Clear stale visibility when content fits or
the viewport is hidden. Verify short content, growth, collapse, viewport resizing,
scrolling and the button action in light/dark and English/Chinese with
`bun run test:blackbox:scroll-to-bottom` against an isolated Tauri instance and
explicit `TAURI_PILOT_SOCKET`; the scenario mounts the real surface without saved
conversation data.

ConversationSurface and the right-sidebar surface share the desktop workspace
card contract owned by the design system's [semantic themes](../../openagent-design-system/references/semantic-themes.md).
Keep their outer shell stable across installed themes; verify both together
with `bun run test:blackbox:semantic-themes`, including zero-radius control presets.

Assistant reply timestamps share the footer metadata typography with first-token
timing and cache usage: 11px, unit line height and muted foreground, vertically
centered in the same wrapping row. Keep their style rule shared so timestamps
cannot drift into a smaller caption style. Verify computed typography and row
alignment in light/dark and English/Chinese with `bun run test:blackbox:turn-footer`.

Sidebar child conversations expand beneath the active ancestor with 24px of
indentation per level, a neutral connector rail, and a rounded elbow ending at
the last direct child's row center. Ancestor rails continue past expanded
descendants; each nested group owns its own connector. Keep project-embedded
and standalone lists on the same recursive renderer, with row-height-aware
connectors, iconless titles, selection, streaming status and delete actions.
Search results stay flat and role-filtered orphans remain roots. Verify nested
selection, collapse after navigation, deletion and narrow title truncation in
light/dark and English/Chinese with `bun run test:blackbox:conversation-tree`
against a task-owned Tauri instance selected by `TAURI_PILOT_SOCKET`. The
scenario mounts the real ConversationList with synthetic data and touches no
saved conversations.

Sidebar row selection follows the design system's
[semantic theme contract](../../openagent-design-system/references/semantic-themes.md).
Run `bun run test:blackbox:sidebar-selection` against an explicitly selected,
isolated debug window to verify selected projects, root/child conversations and
Recents, independent overrides, removal fallback and Rhea's unchanged hover pair
in light/dark and English/Chinese. The runner uses synthetic desktop-shell data.

Production Help -> Debug mode exposes Export complete conversation trace in the
current conversation's debug context bar. The page container calls the scoped
SDK diagnostic operation only on an explicit click, then saves its UTF-8 JSON
through the existing native download capability to Downloads (with Home as
fallback). Keep MessageList presentational. Suppress duplicate exports while a
read/save is pending; show localized success with the path and Open file action,
or failure with retry available. Capture the conversation ID at click time so
navigation cannot change the exported conversation. Disabling Debug mode or
opening New Chat hides the entry. Do not gate this feature on `import.meta.env.DEV`.
The export contains sensitive recorded model context; never route it to telemetry
or load it during ordinary transcript rendering. Attachments remain references.
During an active run it exports the persisted snapshot; export again for later output.
Verify the debug entry, pending state, failure/retry and real local JSON saving in
light/dark and English/Chinese with `bun run test:blackbox:conversation-trace-export`.

The context indicator prefers `active_context_tokens` (latest request input plus
output reported by the provider). Sending input publishes no local estimate.
Keep `context_tokens` as the input-only
fallback for existing usage records, and never derive context occupancy from
cumulative task cost. The denominator follows the selected model's effective
compaction threshold, capped at 90% of its optional configured window. Model
window controls use the existing model dialog, shared input styling, and a writable
settings facade; rename/removal preserve or remove their per-model entries.

New Chat loading keeps the centered composer in its destination layout. Render
context above it only for an actual credential warning; the settled page has no
memory note or greeting, so loading must not reserve space for either. Known
new-conversation suggestions retain their text geometry while loading, with
hidden, disabled placeholders; unknown or absent suggestions reserve no rows.
The composer skeleton includes the formatting, attachment, model, approval and
workspace controls enabled by its host. Select controls and their placeholders
share `--composer-selector-height`, including wrapped toolbar rows.
Verify empty/three/wrapped suggestions,
credential warnings, narrow panes and light/dark, English/Chinese with
`bun run test:blackbox:new-conversation-skeleton` against an isolated debug
instance built from the task worktree and selected by `TAURI_PILOT_SOCKET`.
The Vite origin must match that host's admitted development URL; navigating an
older host to a different port disables the IPC callback used by tauri-pilot.
The scenario mounts the actual ConversationSurface
with deterministic props and never reads or writes Runtime data.

Sidebar-only mode hides the transcript only while the active conversation branch
has an available right-sidebar view. Project the saved conversation collapse
request against sidebar availability for both the title bar and conversation
surface; never hide both workspace surfaces. Switching to a plain conversation,
an empty sibling branch, or New Chat must immediately reveal the transcript and
composer. Keep the saved request so returning to a branch with sidebar content
restores sidebar-only mode. Verify these transitions with
`bun run test:blackbox:sidebar-fullscreen` in an isolated Tauri instance.
Its fullscreen navigation scenarios cover plain conversations, New Chat,
persisted startup, returning to sidebar content, and losing the active plugin
view while its sidebar occupies the workspace.
Start `bun tauri dev --multi-instance sidebar-fullscreen` with a fresh temporary
`OPENAGENT_HOME`, then select that same home and its explicit `TAURI_PILOT_SOCKET`
for the runner. It installs the local Chat Groups fixture, uses a loopback model,
and removes its conversations and package in `finally`. On Windows, set
`BLACKBOX_NATIVE_WINDOW_ID` to the verified main HWND for native captures.

Authored user bubbles reuse `composerMarkdown.parseBlocks` and
`composerDom.renderBlocks`, including headings, quotes, lists, tasks, fenced
code and inline formatting. Attachments and mention tokens retain their chip
projection; raw HTML remains text. Keep the stored Markdown and the plain-text
in-place editor unchanged by rendering. Both editable and read-only bubbles use
the same projection. Long messages clip by an eight-body-line height, rather
than CSS line-clamp, so block formatting survives collapse and expansion.
Leaving the whole user-message editing surface restores Markdown rendering.
Check the settled document focus after Svelte's update, rather than cancelling
on the focused bubble's removal event: clicking or keyboard-activating the bubble
must hand focus to the newly mounted textarea. Exercise focused triggers in
native scenarios; an unfocused DOM `.click()` alone misses this transition.
Bring the native window forward before each focus scenario, including after
navigation/reload; background WebViews can update `activeElement` without
dispatching focus events.
An unchanged edit ends; a changed draft (including staged attachment/quote
removals) stays rendered with Send/Cancel until explicitly submitted or discarded.
Reopening that message retains the draft. Moving focus to its editing actions
or attachments does not end text editing or reset staged changes. Blur never
submits a new turn. Cancel and Escape restore the authored message.
Verify send, expand/collapse, edit/blur/reopen/cancel, read-only and reload with
`bun run test:blackbox:user-message-markdown` in an isolated Tauri window,
covering English/Chinese and light/dark. The development preview loads on demand.

The SDK's `ConversationUi` is the common durable presentation contract.
`role: ui` records retain ID, position and props through checkpoint hydration,
branch switching and rollback. `ConversationUiRecord` renders built-in divider
and notice components; transient compaction, legacy boundaries and Runtime
terminal notices use the same renderer. UI records do not participate in authored-user indexing, editing, copying
or response suggestions. When a UI record lies inside an assistant reply, turn
grouping retains it in order without manufacturing a new Turn or duplicate footer.

History restoration follows the selected checkpoint-tree tip even when its
visible projection contains no assistant message (hidden plugin input or UI-only
records). Skip restoration while the surface knows that conversation is
streaming; Runtime must also serialize restoration with the conversation run
guard because navigation can arrive before live events. An idle tree without a
tip may explicitly clear history. Verify hidden-only and user-only tips, selected
branches, and navigation during an interrupted tool approval.

`bun run test:blackbox:chat-groups-wake` holds each member's first provider
request while native navigation opens its hidden-only conversation. It sends
restore/clear requests from a surface without live state and asserts Runtime
rejection, then releases the model and verifies complete durable snapshots and
visible replies in English/Chinese and light/dark. Runtime contract tests cover
approval tool-use retention through interrupted terminal persistence.

Live checkpoint hydration updates only UI slots and leaves optimistic chat text,
tool cards and pending approval state intact. New records belonging to the live
reply join that conversation's stream items; terminal hydration returns to the
complete snapshot. A durable compaction UI record suppresses the adjacent hidden
provider replay; older projections still use the legacy compaction marker.
Automatic compaction completion uses this same UI-only reconciliation while the
Agent continues running. Never insert the active reply's checkpoint records
alongside its live row: that duplicates its trajectory and response key. Keep
pre-compaction text, reasoning and tool results in the live stream, replace its
transient divider in place, and hydrate the complete transcript after termination.
Manual compaction without an active reply still hydrates the full checkpoint.
The durable completion divider replaces either the in-flight progress slot or
its completed marker in place, regardless of checkpoint/event arrival order.
Repeated hydration updates that divider by ID without appending another one.
Completed replies fold only the prefix before their first visible UI boundary
or final output; keep the boundary and its entire continuation in source order,
including answered/cancelled approvals. Never hoist a later approval ahead of
the compaction that preceded it.
Verify live compaction, completed tool-result disclosure and page restoration in
all light/dark and English/Chinese combinations with
`bun run test:blackbox:compaction-transcript` in a task-owned Tauri window
selected by `TAURI_PILOT_SOCKET`. Its development-only transcript fixture needs
no provider calls or conversation data.
Paired browser state updates reload the checkpoint tree when an idle checkpoint
tip changes, with connection and request generation guards against stale history
responses.

Custom components use the surface's typed `readPluginUiAsset` and
`setConversationUiProps` capabilities, including paired browsers. Resolve a
contained entry from the enabled package rather than persisting executable HTML
or credentials. Render an opaque-origin `sandbox=allow-scripts` frame with a
host-prepended CSP that disables network, forms, popups and parent navigation.
Paired browsers load an authenticated same-origin frame document with the same
restrictions because srcdoc would inherit the SPA's script hash policy.
Props are sent by postMessage, never concatenated into HTML. Verify source window,
version and stable message ID on every reply; bound height and request IDs.
Locale/theme changes send context without reloading the frame or losing drafts.
Props updates preserve iframe identity. Display a stable loading skeleton while
reading assets and saved fallback for unavailable packages or unknown versions.

The public plugin frame protocol and author examples belong to the
[plugin owner](../../openagent-plugin-development/references/conversation-ui.md).
Run `test:blackbox:conversation-ui` in a task-owned Tauri window for built-ins,
custom frame isolation, state save/reload, unavailable fallback and light/dark,
Chinese/English combinations. Unit coverage lives in `conversationUi.test.ts`.
Standalone developer previews load on demand so fixture code stays outside the
production route's initial import graph.

# Client source selection

Frontend imports use `@openagent/client` through the public client facade;
SvelteKit resolves this to a prepared development snapshot or the explicitly
selected source client. Do not import `sdk/typescript` paths in product code.
The release-engineering public-development reference owns kit preparation and
source/version admission.

Skill discovery is Runtime-owned. Frontend configuration snapshots and Flash
settings omit skill-classification controls, and static tool labels follow the
current built-in registry. Discovery diagnostics remain outside the transcript UI.

## Conversation input queue

`createInputQueueController` projects the shared Runtime queue for desktop and
remote composers. Runtime owns acceptance, dispatch, ordering and receipts;
terminal events only refresh the projection. Never dequeue in a frontend or
write queued input into the composer's current draft. Clear only the unchanged
submitted draft after acceptance; preserve newer edits and drafts in another
conversation. Reuse submission identities after an unacknowledged request.
Wait for a newly created desktop conversation to finish persistence before
loading its queue. An existing conversation without branches has an empty queue;
native queue fixtures must start without pre-creating a branch.

Ordinary input during execution waits for the next turn. The separate Add to
current task action targets the displayed active run ID and keeps its model;
a stale or finishing run rejects that action without moving the draft. The
accepted steering input stays exclusively in the queue until Runtime emits
`chat-input-consumed`. That event carries the owning run and canonical user
record, including its stable ID, authored timestamp, attachments and quotes.
Acceptance and provider response-start events never introduce steering bubbles.
Deleted, cleared and rejected inputs remain outside the transcript. Apply the
consumption notification to queue projection and transcript in the same update;
late acceptance/read snapshots cannot resurrect consumed rows. Checkpoint
reconciliation deduplicates by the same stable ID. Next-turn inputs remain
queued until their run-start event.
Consumed steering bubbles follow the preceding provider output. Retain that
output before the bubbles and render subsequent output after them. Split text at
the consumed character offset because consecutive provider responses can
share one text item. Multiple accepted inputs retain submission order; only
the active segment shows running status. These boundaries are transient UI
metadata and never replace checkpoint order or create persisted assistant rows.
The queue uses stable message IDs, revision-checked editing/reordering, explicit
pause/resume, and retry/remove actions. Stop preserves pending inputs. Loading
and errors retain the queue surface and expose refresh. Attachment references
and model/branch selections travel with the queued input.

Queue rows and their count include only waiting and failed receipts. An idle,
unpaused queue's first ordinary input is awaiting immediate dispatch when no
claimed or failed head blocks it, and does not open the panel; later waiting
inputs do. Paused heads and failures remain
visible. An empty queue's initial/background read never mounts the panel or
skeleton by itself; loading feedback remains inside an already relevant queue.
Claimed inputs belong to the live transcript; a lone running receipt must not open the
queue panel. Use the snapshot's active run identity for execution state rather
than inferring activity from receipt status. A refresh notification during an
in-flight read schedules one trailing read so terminal state cannot be dropped.
Keep Add to current task inside the composer's wrapping toolbar. Reserve room
for send, Stop and context usage together; toolbar actions must never increase
the outer positioning container below the input surface. Native queue coverage
asserts containment and non-overlap with a draft during execution, including a
narrow composer, then ordinary send controls after completion.

Verify branchless reads, first send with delayed conversation persistence,
queue editing, ordering, failed acceptance with a newer draft, pause,
Stop, reload and explicit steering using `bun run test:blackbox:input-queue`
in an isolated Tauri instance, in light/dark and English/Chinese. Runtime
persistence and dispatch invariants are owned by the private conversation skill.
The native fixture holds the model after consuming steering and after starting
the next queued turn, asserting both user bubbles before completion and exactly
one of each after terminal hydration.
Assert DOM order and output on both sides of steering bubbles while the
original response and its continuation are held, including multiple inputs
consumed at one boundary; presence alone does not establish correct placement.
Use a DOM observer to reject any queue-panel flash during ordinary idle sends
and delayed first-send queue reads. Hold the provider while steering is queued
and require no user bubble; then check the atomic queue-to-transcript handoff.
Removed inputs must stay absent after continuation and checkpoint hydration.
