# Codex V2 Message Board

This OpenAgent plugin provides the Codex V2 agent message-board model over a
portable stdio MCP server. Install the `codex-v2-message-board` directory from
OpenAgent's plugin settings. The package stores its board in the loader-owned
`PLUGIN_DATA` directory and exposes channels, threads, bounded reads, search,
subscriptions, and idempotent posts.

Each call supplies an `agent_id`, normally the caller's absolute subagent path.
The portable MCP boundary cannot wake an idle subagent, so `agents_to_notify`
is retained as handoff metadata while turn lifecycle remains host-owned.
