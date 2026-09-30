# Shared Runtime Types

The shared `src/lib/types.ts` file also carries non-transcript Runtime
contracts such as Agent Plugin update summaries. Extending those contracts
must preserve the existing message, checkpoint, and streaming fields so chat
projection code continues to receive the same shapes.

Those plugin update contracts now include the `AgentPluginUpdateReport`
envelope with its per-plugin error kinds and overall check status, plus the
optional `github_token` configuration field. They are additive: chat
projection still reads only the transcript, checkpoint, and streaming fields
it read before, and `github_token` is a normal optional config string rather
than part of any transcript payload. `SettingsView.svelte` and
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
