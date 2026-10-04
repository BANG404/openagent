# Message board package

The independent [Message Board repository](https://github.com/BANG404/message-board)
is pinned as a Git submodule at `plugins/message-board/` and adapts
Codex's agent message board to the portable Agent Plugin boundary. Its
stdio MCP server exposes the nine board tools (channels, threads, search,
bounded reads, subscriptions, and idempotent posts) and stores state only in
the loader-provided `PLUGIN_DATA` directory.

The portable MCP transport cannot receive the Runtime's authoritative agent
path or wake an idle child turn. The package therefore requires an explicit
`agent_id` on every tool call and treats `agents_to_notify` as handoff metadata;
the host remains responsible for process lifecycle and any future notification
bridge. Do not add transcript access, model context, or host credentials to the
plugin. The package owns implementation and publication; the parent owns its
gitlink, development index entry, and `tests/messageBoardPlugin.test.ts`
integration coverage. Changes to the board schema must preserve bounded output
and request idempotency. Initialize the submodule before running host tests.
