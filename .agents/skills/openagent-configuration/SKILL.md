---
name: openagent-configuration
description: Use for OpenAgent configuration files, application-data paths, persistence, context compaction, permissions, diagnostics, backups, migrations, or startup data transitions.
metadata:
  category: data-and-configuration
---

# OpenAgent configuration

Route to the smallest reference that matches the change. The public contract
is maintained in [docs/configuration.md](../../../docs/configuration.md); use
the section map below instead of loading the whole document.

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

Keep durable-data ownership in the SDK and update the matching public section
when the user-visible contract changes. Read `sdk/AGENTS.md` for SDK work.
