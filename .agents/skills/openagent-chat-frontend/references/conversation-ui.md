# Conversation components

The SDK's `ConversationUi` is the common durable presentation contract.
`role: ui` records retain ID, position and props through checkpoint hydration,
branch switching and rollback. `ConversationUiRecord` renders built-in divider
and notice components; transient compaction, legacy boundaries and Runtime
terminal notices use the same renderer. UI records do not participate in authored-user indexing, editing, copying
or response suggestions. When a UI record lies inside an assistant reply, turn
grouping retains it in order without manufacturing a new Turn or duplicate footer.

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
