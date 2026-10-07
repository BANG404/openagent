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

The current templates declare plugin protocol 1. Keep the range you have verified; package version and Runtime version are separate boundaries. Protocol admission does not guarantee every optional Host Bridge operation exists. Feature-detect optional embedding or conversation UI before invoking it, and provide an actionable unsupported result.

Workflows that create conversations or wake Agents should use the shared [Host Bridge client](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/host-bridge.md). Domain state and orchestration belong to the plugin. No private SDK import is needed.

## Code and data have different lifetimes

| Location | Purpose |
| --- | --- |
| `${PLUGIN_ROOT}` | Installed package files; do not use as a writable database |
| `${PLUGIN_DATA}` | Package-owned persistent state; retained across updates and uninstall |

Use the exported values rather than deriving user-home paths. Plugin processes follow the current execution permission profile and receive a write grant to their own data directory. Computer access, when needed, follows the host's explicit grant flow; a manifest declaration is not blanket permission.

Package paths cannot escape through `..`, symlinks, or junctions. Malformed optional components can be disabled independently; a rejected manifest prevents admission. Check diagnostics and exercise every declared component, rather than treating a visible plugin card as proof that its tools loaded.

See the [public field reference](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md) for commands, automation, daemons, and conversation components.
