---
name: openagent-plugin-development
description: Use for Agent Plugin packages, plugin.json or mcp.json validation, bundled Skills, MCP transport setup, plugin data, trust boundaries, or plugin installation behavior.
metadata:
  category: integrations
---

# Agent Plugins

Read [package-format.md](references/package-format.md) for the portable format,
installation behavior, and data layout. Keep package containment, component-level failure
isolation, placeholder expansion, remote MCP origin rules, and separate
`PLUGIN_DATA` persistence intact. Installation and trust policy belong to the
client integration; the portable format does not imply a marketplace or an
automatic update path.
