# Plugin sidebar invariant

The conversation shell owns right-sidebar selection. Plugin panels use
`plugin:<plugin-id>:<view-id>` IDs and the existing conversation/branch scope.
Keep plugin surfaces isolated and pass only the allowlisted sidebar context.
The panel may send workspace, opaque conversation/branch IDs, file-change
metadata, locale, and theme only when the manifest view requests the matching
capability. Refresh the versioned `openagent:sidebar-context` message when the
scope or host context changes, and load assets only through the declared sidebar
entry operation. Never pass transcript text, prompts, model output, diffs, or
Inspector data into a plugin iframe.
Plugin update checks may refresh settings and show a localized reminder; they
must not replace an installed package from the chat shell.

## Availability and navigation

`src/lib/pluginSidebar.ts` is the single lifecycle gate for the right sidebar.
A declared view is available only while its plugin is enabled, free of manifest
or component errors, and its declared scope is satisfied by the active context;
every other declared view is disabled, invalid, or out of scope. Only available
views reach the panel navigation, and the same gate backs the plugin manager, so
a listed view is never an entry the sidebar would refuse to mount.

When the selected panel stops being available - its plugin was disabled, its
package failed to load, or the scope emptied - the shell navigates to a built-in
fallback instead of rendering an empty surface. A plugin panel that is the only
remaining detail surface replaces the empty status view, so a sidebar that is
open on nothing never survives.

The plugin manager in Settings lists each declared view with the same lifecycle
state and offers "open in sidebar", which selects the panel and expands the
sidebar. A view the host cannot mount stays listed but disabled with its reason
instead of hiding the declaration.
Because the manager reads its own installed-plugin summary, a settings save that
changed plugin enablement re-reads it, so toggling a plugin updates every listed
row without remounting the settings surface.

## Live panel documents

The shell derives one `pluginSidebarRevision` from the installed package
identities of the visible panels and passes it to every mounted plugin panel. A
revision change re-reads the declared entry through `read_agent_plugin_asset`,
so an install, update, remove, manual refresh, or enable/disable replaces the
mounted document instead of leaving the panel on the snapshot it read first.
Treat a panel as a live view of the installed package rather than a static HTML
page.

## Package tool requests

Workspace-capable panels receive `tool_calls: true` in context and may send
`openagent:sidebar-tool-call` version 1 with the current `scope`, a bounded
`request_id`, `tool_name`, and object `arguments`. The host validates the frame
source, scope and payload size, calls `call_agent_plugin_tool` for the panel's
own plugin, and returns `openagent:sidebar-tool-result` with matching request
ID/scope, `ok`, and the MCP `result` or `error`. Never accept a plugin ID or
sender context from a frame; host workspace/locale and empty Agent sender IDs
replace `_openagent`. Drop replies after scope, document, or frame replacement.
`openagent:sidebar-ready` version 1 requests context after bootstrap.

Chat Groups declares a workspace panel in its package. The shell does not parse
group state or transcript tool results to create a built-in group panel. Native
qualification is `test:blackbox:chat-groups-sidebar` with a fresh isolated home
and explicit pilot socket, covering existing data, send/reload, workspace
isolation, enablement and live locale/theme changes.
Workspace scope keeps the panel available without an open conversation;
requested `conversation`/`branch` capabilities still receive live IDs. Chat
Groups filters its own list with `chat_group_list.conversation_id` when an ID is
present, using creator, membership and persisted Agent sender associations.
Without an ID it lists the workspace. A conversation change immediately clears
the previous messages, members and mention palette, invalidates pending reads,
and restores the remembered group selection and that group's draft. Branch
changes retain conversation associations. Group switches expose a loading state
and disable sending until members and messages load. Do not pass the displayed
conversation as an Agent sender: sidebar sends still use the host's empty sender
context.
The sidebar native runner covers actual conversation switching, branch-context
updates, unrelated empty states, rapid scope changes, draft restoration and late
tool replies.
The package's Chat Groups view retains the desktop group-panel visual grammar:
compact title/count, collapsible member pills, sticky headings for consecutive
messages from one sender, and a floating Mica composer. Its inline theme tokens
match `app.css`; bound the message scroll viewport above the composer so the
whole scrollbar and trailing message stay reachable even when input height
changes. Verify long messages, narrow widths, and sender transitions in the
native runner.
The package's composer Stop control invokes `chat_group_stop` through the same
scoped sidebar tool bridge. Group cancellation belongs to the package; do not
add group-aware cancellation to the host. The sidebar runner verifies localized
Stop, duplicate-action guarding and draft/history preservation in all four
theme/locale combinations; the wake runner verifies cancellation of running
member turns and later user-triggered resumption.
Chat Groups renders sanitized GFM inside its package document, preserving raw
HTML as text and keeping wide code/table scrolling inside the message. Its `@`
palette filters current members, supports keyboard and pointer selection and
IME, and replaces only the caret's current mention. Native qualification covers
Markdown, unsafe URLs/HTML, palette filtering, quoted names, keyboard selection,
workspace/group reset, and live theme/locale changes.

Panels may detect `open_links: true` and request `openagent:sidebar-open-link`
version 1 with the current `scope` and bounded absolute HTTP(S) `url`. The host
checks the owning frame and scope and uses the shared UI URL opener. Plugins
prevent iframe navigation; older hosts simply leave the rendered link inert.

A panel document is still a single declared entry: package sub-resources are
outside the current asset boundary, so a plugin page must inline its own styles
and scripts. Multi-file plugin pages require a Runtime-owned plugin asset route
through the supervised asset protocol; do not serve plugin package files from
the desktop shell, which cannot validate a package without the Runtime.
