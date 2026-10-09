# Conversation components

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
