---
title: Add MCP tools
description: Scaffold a stdio server, keep state in PLUGIN_DATA, and choose how tools become available.
---

## Start with a working server

From the same project root as the [first tutorial](../first-plugin/):

```sh
bun tools/openagent-plugin-kit/scripts/new-plugin.mjs notes-tools --template mcp-tools --dir plugins
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/notes-tools --require-i18n
```

The template includes a dependency-free Node.js stdio server. Read its existing `server/index.mjs` implementation before extending its `tools/list` and `tools/call` handlers. Preserve MCP framing; send logs to stderr, since stdout carries protocol messages.

## Declare transport and data

The generated `mcp.json` uses this shape:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "notes": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/server/index.mjs"],
      "env": { "NOTES_FILE": "${PLUGIN_DATA}/notes.json" },
      "cwd": "${PLUGIN_DATA}"
    }
  }
}
```

Use `${PLUGIN_ROOT}` for executable resources and `${PLUGIN_DATA}` for persistent state. The host expands these values after installation. HTTP servers are also supported; transport and authentication details are in the [MCP field reference](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md).

## Direct and Relay

Configure mounting in `plugin.json`, under `extensions.openagent`:

```json
{
  "mcp_tool_mode": "relay",
  "mcp_tool_modes": { "notes": "direct" }
}
```

This is a fragment to merge into the existing extension, preserving its capabilities, compatibility, and i18n fields. `direct` is the default and makes tools immediately available to the model. `relay` exposes discovery and mounting through `load_tool`. Server-specific overrides use keys from `mcp.json`. Users can override either mode in Settings; availability still follows role and permission policy.

For execution-scoped leases, start with `mcp-lifecycle` and follow the [lease contract](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/mcp-lifecycle.md).

## Verify the installed copy

Install, enable, and call an existing template tool in a project conversation. Confirm tool discovery, a successful result, and persistence after reopening. Then check invalid arguments, process failure, and the selected mounting mode. Reinstall source changes before retesting.

Keep credentials out of archives and logs. User-visible tool notices should consume the host-provided `_openagent.locale`; independent process notices can query `host.locale.get()`. Translate notices without changing protocol identifiers or user content.
