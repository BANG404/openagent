# Plugin sidebar invariant

The conversation shell owns right-sidebar selection. Plugin panels use
`plugin:<plugin-id>:<view-id>` IDs and the existing conversation/branch scope.
Keep plugin surfaces isolated and pass only the allowlisted sidebar context.
Plugin update checks may refresh settings and show a localized reminder; they
must not replace an installed package from the chat shell.
