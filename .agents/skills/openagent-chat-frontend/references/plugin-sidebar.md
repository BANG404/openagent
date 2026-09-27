# Plugin sidebar invariant

The conversation shell owns right-sidebar selection. Plugin panels use
`plugin:<plugin-id>:<view-id>` IDs and the existing conversation/branch scope.
Keep plugin surfaces isolated and pass only the allowlisted sidebar context.
