---
name: openagent-plugin-development
description: Use for Agent Plugin packages, plugin.json or mcp.json validation, bundled Skills, MCP transport setup, plugin data, trust boundaries, or plugin installation behavior.
metadata:
  category: integrations
---

# Agent Plugins

Read [docs/agent-plugins.md](../../../docs/agent-plugins.md) for the portable
format and product behavior. Keep package containment, component-level failure
isolation, placeholder expansion, remote MCP origin rules, and separate
`PLUGIN_DATA` persistence intact. Installation and trust policy belong to the
client integration; the portable format does not imply a marketplace or an
automatic update path.
