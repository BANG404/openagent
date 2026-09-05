# Save and reload

Read `docs/configuration.md` section `Save and reload behavior` for changes to
configuration writes, file watching, conflict detection, MCP tool settings,
credentials, onboarding persistence, or resource preparation.

Preserve atomic replacement, last-known-good recovery, independent writer
conflict handling, and the rule that invalid external edits do not replace the
validated in-memory snapshot. Hosts present state; SDK-owned code performs
normalization, persistence, and recovery.
