# Shared Runtime Types

The shared `src/lib/types.ts` file also carries non-transcript Runtime
contracts such as Agent Plugin update summaries. Extending those contracts
must preserve the existing message, checkpoint, and streaming fields so chat
projection code continues to receive the same shapes.

Those plugin update contracts now include the `AgentPluginUpdateReport`
envelope with its per-plugin error kinds and overall check status. They are additive: chat
projection still reads only the transcript, checkpoint, and streaming fields
it read before. `SettingsView.svelte` and
`PageRuntime.svelte` consume the envelope through
`src/lib/agentPluginUpdateCheck.ts`; a change to those types is owned by
`.agents/skills/openagent-plugin-development/`, not by chat behavior.

Published plugin sources are maintained in the public
[openagent-plugin-kit](https://github.com/BANG404/openagent-plugin-kit) and
the product package repositories:

- [Chat Groups](https://github.com/BANG404/openagent-chat-groups)
- [Goal](https://github.com/BANG404/openagent-goal)
- [Graph](https://github.com/BANG404/openagent-graph)

Portable automation messages with `user_visible: true` arrive as user-role
plugin records. `PluginMessage.svelte` is the common transcript renderer: it
does not expose edit controls or user-message indexing and labels the source
plugin from `plugin:<plugin-id>:<tag>` in `pluginTags`.

Goal and Graph are package examples, not frontend-owned command implementations.
The composer and transcript consume the generic plugin command, event, and
checkpoint projections so another package can provide the same surfaces without
a new frontend branch. A package owns its state machine and continuation
scheduling; the frontend only renders the projection and routes the command.

Plugin command summaries admit `optional_text` alongside `none` and
`required_text`. Bare and parameterized commands use the same SDK submission
path; domain subcommands are interpreted by the package, never the composer.

Plugin command summaries optionally carry validated `plugin_i18n` presentation
metadata. Resolve labels and descriptions against the application locale in
both desktop and remote composers; keep the original command IDs and submission
path. MCP App frames initialize `hostContext.locale` from the application locale
and send `ui/notifications/host-context-changed` on live switching without
remounting the iframe or discarding its input. Browser language is not a host
locale source. Package language requirements belong to plugin development.

ConversationSurface also derives sidebar context from the resolved application
locale store, rather than the raw configuration preference (`system` or a stale
saved snapshot). Sidebar titles and first/live context must follow the same locale
while preserving the mounted iframe and its draft.
