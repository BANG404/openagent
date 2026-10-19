---
name: openagent-configuration
description: Use for OpenAgent configuration files, application-data paths, persistence, context compaction, permissions, diagnostics, backups, migrations, or startup data transitions.
metadata:
  category: data-and-configuration
---

# Configuration and persistence

Public `openagent-config` owns settings; Runtime owns conversations. Preserve migrations, backups and user-maintained data.

| Task | Read |
| --- | --- |
| Data locations, databases, startup and migrations | [Data and startup](references/data-and-startup.md) |
| Save, reload and window synchronization | [Save and reload](references/save-and-reload.md) |
| Online compatibility decisions and offline behavior | [Compatibility policy](references/compatibility-policy.md) |
| Context compaction settings and presentation | [Context compaction](references/context-compaction.md) |
| Tool permissions and authorization settings | [Permissions](references/permissions.md) |
| Package enablement and lifecycle settings | [Plugin enablement](references/plugin-enablement.md) |
| Error collection and explicit problem reports | [Diagnostics](references/diagnostics.md) |
| Read-only operator queries and deployment | [Observability](references/observability-query.md) |
