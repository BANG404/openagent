---
name: openagent-persistence
description: Preserve OpenAgent configuration and durable-data compatibility. Use for config.toml, messages.db, memory, OPENAGENT_HOME, settings persistence, migrations, backups, schema versions, or startup data inspection.
metadata:
  category: data-and-configuration
---

# OpenAgent persistence

Use `openagent-configuration` to route to the smallest configuration reference
before editing. `docs/configuration.md` remains the public source of truth for
paths, schemas, save and reload behavior, compatibility windows, permissions,
and user-visible transitions. Read `sdk/AGENTS.md` before changing SDK-owned
implementation.

## Boundaries

- The SDK owns configuration and database inspection, normalization, migration,
  backup, and reset operations. Hosts may present a consent UI but must not
  reimplement file or SQLite operations.
- Inspect persisted compatibility before runtime and WebView construction.
  Interactive desktop startup may let the user exit or approve the SDK-owned
  backup and fresh affected store; standalone startup must fail rather than
  infer consent.
- Evaluate configuration and conversation stores independently so an invalid
  scope does not erase a valid one.
- Never overwrite user-maintained memory sections. Use existing structured
  commands or tools for structured memory changes.
- Keep versioned embedding resources beneath `OPENAGENT_HOME/resources`. Stage
  packaged-seed copies and downloads outside the active version directory,
  verify every declared size and SHA-256, and atomically activate only a
  complete resource. Hosts may project progress but do not own these files.
- Keep frontend versions immutable beneath `resources/frontend/<version>`.
  Replace `active.json` atomically, retain one previous verified selection while
  activation is pending, and treat an unconfirmed startup as rollback state.

## Compatibility changes

Treat every configuration or conversation shape as versioned. A newly supported
shape includes explicit migration or normalization for its full declared
support window plus success and failure coverage. Do not grow indefinite legacy
paths beyond that window.

When support ends, ship all of the following together:

- a warning that identifies the affected data;
- a concrete chance and instructions to save or back it up;
- a durable backup before replacement;
- version-boundary documentation in `docs/configuration.md`;
- coverage proving refusal, backup failure safety, consent, and scope isolation.

Routine development uses `~/.openagent-dev`, never installed release state.
File- and database-backed views expose loading explicitly and use layout-stable
skeletons.
