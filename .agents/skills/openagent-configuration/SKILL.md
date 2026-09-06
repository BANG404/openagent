---
name: openagent-configuration
description: Use for OpenAgent configuration files, application-data paths, persistence, context compaction, permissions, diagnostics, backups, migrations, or startup data transitions.
metadata:
  category: data-and-configuration
---

# OpenAgent configuration

Route to the smallest reference that matches the change:

- Paths, durable files, migration, and startup transitions:
  [references/data-and-startup.md](references/data-and-startup.md)
- Atomic save, reload, conflicts, and MCP settings:
  [references/save-and-reload.md](references/save-and-reload.md)
- Context compaction behavior:
  [references/context-compaction.md](references/context-compaction.md)
- Tool approval, sandbox, and network permissions:
  [references/permissions.md](references/permissions.md)
- Software error collection and diagnostic privacy:
  [references/diagnostics.md](references/diagnostics.md)

Screenshots used by the README live in `assets/`; they are output resources,
not instructions. Keep durable-data ownership in the SDK and update the matching
reference when behavior changes. Read `sdk/AGENTS.md` for SDK work.
