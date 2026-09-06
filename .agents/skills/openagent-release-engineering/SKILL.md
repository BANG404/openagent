---
name: openagent-release-engineering
description: Preserve OpenAgent CI and release qualification. Use for GitHub workflows, CI path classification, release scripts, Tauri bundles, platform sidecars, pinned Codex helpers, versioning, updater artifacts, or release gates.
metadata:
  category: release-engineering
---

# OpenAgent release engineering

Read only the operational reference that matches the task:

- Qualification, path classification, release gates, credentials, caches, and
  workflow lint constraints: [qualification.md](references/qualification.md)
- Native bundles, helper binaries, Runtime/frontend resources, manifests,
  signing, publication ordering, and development sidecars:
  [artifacts.md](references/artifacts.md)
- CI routing and required checks: [ci-routing.md](references/ci-routing.md)
- Private SDK qualification and diagnostic boundaries: [sdk-ci.md](references/sdk-ci.md)
- Publishing sequence and release assets: [publishing.md](references/publishing.md)
- Microsoft Store packages: [microsoft-store.md](references/microsoft-store.md)
- Version channels and release numbering: [versioning.md](references/versioning.md)
- Commit conventions: [commit-conventions.md](references/commit-conventions.md)
- Local release commands: [local-commands.md](references/local-commands.md)
- Release source boundaries: [release-sources.md](references/release-sources.md)
- Development Runtime refresh: [development-runtime.md](references/development-runtime.md)

Use `deliver-via-pr` for repository delivery. Its preflight and CI handoff
rules remain authoritative; do not duplicate ordinary CI locally.
