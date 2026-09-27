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
