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
remaining detail surface replaces the empty status view, matching the existing
chat-group recovery, so a sidebar that is open on nothing never survives.

The plugin manager in Settings lists each declared view with the same lifecycle
state and offers "open in sidebar", which selects the panel and expands the
sidebar. A view the host cannot mount stays listed but disabled with its reason
instead of hiding the declaration.

## Live panel documents

The shell derives one `pluginSidebarRevision` from the installed package
identities of the visible panels and passes it to every mounted plugin panel. A
revision change re-reads the declared entry through `read_agent_plugin_asset`,
so an install, update, or enable/disable replaces the mounted document instead
of leaving the panel on the snapshot it read first. Treat a panel as a live
view of the installed package rather than a static HTML page.

A panel document is still a single declared entry: package sub-resources are
outside the current asset boundary, so a plugin page must inline its own styles
and scripts. Multi-file plugin pages require a Runtime-owned plugin asset route
through the supervised asset protocol; do not serve plugin package files from
the desktop shell, which cannot validate a package without the Runtime.
