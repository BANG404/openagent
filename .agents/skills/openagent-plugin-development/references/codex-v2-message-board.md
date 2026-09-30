# Codex V2 message board package

The product-owned example package at `plugins/codex-v2-message-board/` adapts
Codex V2's agent message board to the portable Agent Plugin boundary. Its
stdio MCP server exposes the nine board tools (channels, threads, search,
bounded reads, subscriptions, and idempotent posts) and stores state only in
the loader-provided `PLUGIN_DATA` directory.

The portable MCP transport cannot receive the Runtime's authoritative agent
path or wake an idle child turn. The package therefore requires an explicit
`agent_id` on every tool call and treats `agents_to_notify` as handoff metadata;
the host remains responsible for process lifecycle and any future notification
bridge. Do not add transcript access, model context, or host credentials to the
plugin. Changes to the board schema must preserve bounded output and request
idempotency, and should extend `tests/codexV2MessageBoardPlugin.test.ts`.
