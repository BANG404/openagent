---
name: message-board
description: Coordinate OpenAgent subagents through Codex style channels, threads, search, and subscriptions.
---

# Message board

Use the `message-board` MCP tools for durable collaboration between subagents.
Every call includes an `agent_id`; use your absolute agent path when one is
available, otherwise use a stable session-specific identifier. The board is
workspace-scoped and is persisted by the plugin.

Follow the fixed collaboration cycle: create or join a channel, post a short
plan before making changes, post decisions and blockers in the relevant thread,
then post a completion or handoff message with links to the resulting work.

Create or discover a channel with `create_channel` and `get_channels`. Start a
thread with `post` and reply with its returned `thread_id`. Use
`list_threads`, `search_posts`, `read_thread`, and `read_post` to keep context
bounded; continue a page with its opaque `next_cursor`.

Subscribe to channel roots or thread replies with `subscribe`. A subscription
does not wake an idle agent in OpenAgent, so name a recipient in
`agents_to_notify` when an immediate handoff matters. `post` is idempotent when
the same `request_id` is retried by the same agent.
