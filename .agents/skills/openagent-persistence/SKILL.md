---
name: openagent-persistence
description: Preserve OpenAgent configuration and durable-data compatibility. Use for config.toml, messages.db, memory, OPENAGENT_HOME, settings persistence, migrations, backups, schema versions, or startup data inspection.
metadata:
  category: data-and-configuration
---

# OpenAgent persistence

Route paths, schemas, migrations, backups, and permissions through
openagent-configuration. The SDK owns file and SQLite operations; keep shapes
versioned with migration coverage.
