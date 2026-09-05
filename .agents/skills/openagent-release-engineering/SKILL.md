---
name: openagent-release-engineering
description: Preserve OpenAgent CI and release qualification. Use for GitHub workflows, CI path classification, release scripts, Tauri bundles, platform sidecars, pinned Codex helpers, versioning, updater artifacts, or release gates.
metadata:
  category: release-engineering
---

# OpenAgent release engineering

Read only the relevant page routed from [docs/release.md](../../../docs/release.md)
before editing; those pages are the public source of truth for release sources,
artifacts, modular CI, qualification, and local commands. Use the topic map
below instead of loading every release page. Read `sdk/AGENTS.md` for private
SDK workflow changes.

Read only the operational reference that matches the task:

- Qualification, path classification, release gates, credentials, caches, and
  workflow lint constraints: [qualification.md](references/qualification.md)
- Native bundles, helper binaries, Runtime/frontend resources, manifests,
  signing, publication ordering, and development sidecars:
  [artifacts.md](references/artifacts.md)
- CI routing and required checks: [ci.md](references/ci.md)
- Publishing and platform packages: [publishing.md](references/publishing.md)
- Version channels and release numbering: [versioning.md](references/versioning.md)
- Commit conventions and local release commands:
  [workflow-basics.md](references/workflow-basics.md)
- Release source boundaries and development Runtime refresh:
  [sources-and-runtime.md](references/sources-and-runtime.md)

Use `deliver-via-pr` for repository delivery. Its preflight and CI handoff
rules remain authoritative; do not duplicate ordinary CI locally.
