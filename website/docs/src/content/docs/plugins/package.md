---
title: Package contract
description: Understand portable package identity, OpenAgent extensions, compatibility, and persistent data.
---

## Files the loader reads

```text
project-notes/
  plugin.json
  skills/
    project-notes/
      SKILL.md
  mcp.json             # optional MCP declaration
  ui/panel.html        # referenced by a sidebar extension
  bin/                 # referenced by commands or hooks
```

The loader reads `plugin.json`, immediate Skill directories, and optional `mcp.json`. Other directories are package data unless an extension references them.

## A small manifest

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "project-notes",
  "version": "1.0.0",
  "description": "Record project decisions.",
  "repository": "https://github.com/you/project-notes",
  "extensions": {
    "openagent": {
      "category": "productivity",
      "compatibility": { "plugin_protocol": { "min": 1, "max": 1 } },
      "capabilities": ["skills"],
      "i18n": {
        "supported_locales": ["en", "zh"],
        "default_locale": "en",
        "translations": {
          "en": { "display_name": "Project Notes", "description": "Record project decisions." },
          "zh": { "display_name": "项目笔记", "description": "记录项目决策。" }
        }
      }
    }
  }
}
```

Replace the example repository before publishing. The lowercase portable `name` is the routing, update, and data identity; keep it stable. Translate `display_name`, never the ID. Use SemVer for predictable updates. OpenAgent-only fields belong under `extensions.openagent`, not the portable MCP declaration.

## Protocol and optional capabilities

The current templates declare plugin protocol 1. Keep the range you have verified. These identities have separate purposes:

| Identity | Meaning |
| --- | --- |
| Portable `$schema` version | Package/MCP format, currently Agent Plugins 1.0.0 |
| Package `version` | Your independently published release |
| `compatibility.plugin_protocol` | Inclusive verified OpenAgent plugin protocol range |
| `compatibility.features` | Required versioned capabilities; unsupported requirements reject admission |
| Runtime release version | Host implementation release, not a substitute for capability checks |

For example, configuration needs `configuration-v1`, browser OAuth needs `plugin-oauth-v1`, and theme packages need `theme-v1`. Preserve all required features when combining components. Protocol admission does not guarantee every optional Host Bridge operation exists. Detect optional embedding or conversation UI before invoking it, and provide an actionable unsupported result. See [Host Bridge workflows](../workflows/) for runtime discovery.

Workflows that create conversations or wake Agents should use the shared [Host Bridge client](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/host-bridge.md). Domain state and orchestration belong to the plugin. No private SDK import is needed.

## Code and data have different lifetimes

| Location         | Purpose                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `${PLUGIN_ROOT}` | Installed package files; do not use as a writable database            |
| `${PLUGIN_DATA}` | Package-owned persistent state; retained across updates and uninstall |
| Host-managed `plugin-settings/<id>.json` | User configuration and secrets; consume through declared bindings |

Use the exported values rather than deriving user-home paths. Plugin processes follow the current execution permission profile and receive a write grant to their own data directory. Computer access, when needed, follows the host's explicit grant flow; a manifest declaration is not blanket permission.

Package paths cannot escape through `..`, symlinks, or junctions. Malformed optional components can be disabled independently; a rejected manifest prevents admission. Check diagnostics and exercise every declared component, rather than treating a visible plugin card as proof that its tools loaded.

See the [public field reference](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md) for commands, automation, daemons, and conversation components.

## Pick the smallest component boundary

| Need | Component | Next chapter |
| --- | --- | --- |
| Reusable task instructions | Bundled Skill | [First plugin](../first-plugin/) |
| Execute a typed operation | MCP server | [MCP tools](../mcp/) |
| User-supplied parameters or OAuth | Configuration and HTTP MCP | [Configuration](../configuration/) |
| Explicit entry or lifecycle reaction | Command or automation hook | [Commands](../commands/) |
| Scoped panel or persisted inline record | Sidebar or conversation UI | [UI and languages](../sidebar/) |
| Conversation-aware orchestration | Package state plus Host Bridge | [Workflows](../workflows/) |

The kit also provides `theme` and `integration` templates. Themes use `type: "theme"` and validated tokens under `theme` with `theme-v1`; they cannot inject arbitrary application CSS. Integration presentation uses `type: "integration"`, `integration-v1`, and its referenced Skills/MCP components. Keep their template declarations and follow the [presentation field reference](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md) rather than treating a category as a package type or a permission grant.

## Categories

Optional `extensions.openagent.category` declares one stable discovery ID:
`development`, `productivity`, `communication`, `automation`, `data`, `design`
or `other`. Omission means uncategorized; null, arrays and unknown IDs fail
manifest validation. Clients translate labels while IDs stay unchanged. Store
category filtering intersects search and installation status. Categories grant
no permissions and do not change the plugin protocol version.
