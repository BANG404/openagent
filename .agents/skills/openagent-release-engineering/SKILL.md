---
name: openagent-release-engineering
description: Preserve OpenAgent CI and release qualification. Use for GitHub workflows, CI path classification, release scripts, Tauri bundles, platform sidecars, pinned Codex helpers, versioning, updater artifacts, or release gates.
metadata:
  category: release-engineering
---

# OpenAgent release engineering

Read the relevant page routed from [docs/release.md](../../../docs/release.md)
before editing; those pages are the public source of truth for release sources,
artifacts, modular CI, qualification, and local commands. Read `sdk/AGENTS.md`
for private SDK workflow changes.

Read only the operational reference that matches the task:

- Qualification, path classification, release gates, credentials, caches, and
  workflow lint constraints: [qualification.md](references/qualification.md)
- Native bundles, helper binaries, Runtime/frontend resources, manifests,
  signing, publication ordering, and development sidecars:
  [artifacts.md](references/artifacts.md)

Use `deliver-via-pr` for repository delivery. Its preflight and CI handoff
rules remain authoritative; do not duplicate ordinary CI locally.
