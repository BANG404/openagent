---
name: openagent-release-engineering
description: Preserve OpenAgent CI and release qualification. Use for GitHub workflows, CI path classification, release scripts, Tauri bundles, platform sidecars, pinned Codex helpers, versioning, updater artifacts, or release gates.
metadata:
  category: release-engineering
---

# OpenAgent release engineering

Read the relevant section of `docs/release.md` before editing; it is the public
source of truth for release sources, artifacts, modular CI, qualification, and
local release commands. Read `sdk/AGENTS.md` for private SDK workflow changes.

## Keep qualification aligned

- Keep the path classifier, reusable workflow inputs, result verifier, release
  gate, and their tests aligned whenever a module boundary changes.
- Pull requests run diff-selected fast checks only for contributors without
  administrator permission. Administrator-authored PRs use the documented
  bypass after local preflight. Ordinary `master` pushes do not replace release
  qualification.
- Release, nightly, and explicit manual qualification force every frontend,
  automation, native, embedding, and Harness capability. A failed qualification
  stops tagging, building, and publication.
- Treat the private SDK gitlink as release-relevant input. Private SDK output,
  build artifacts, and target caches must not leak into public logs, artifacts,
  or caches; keep Rust caches at `cache-targets: false`.

## Host and helper artifacts

- Native CI that compiles Tauri without the frontend build must materialize the
  configured `frontendDist`; frontend qualification owns the production build.
  Keep direct native-dialog dependencies from enabling a Linux backend that
  conflicts with the backend selected by `tauri-plugin-dialog`.
- Build platform sandbox helpers from the Codex revision pinned by the SDK.
  Never reset or overwrite a divergent SDK checkout automatically, and never
  mix library, setup-helper, and command-runner revisions.
- Windows bundles both sandbox helpers only through the Windows Tauri config
  and produces NSIS plus updater artifacts, not WiX. Linux strips
  `codex-bwrap`, embeds its SHA-256 at release compilation, and packages those
  exact bytes through `externalBin`.
- Use `bun run tauri:build` for release builds so generated helper digests reach
  Cargo. Keep the release Cargo profile size-oriented and audit installer size,
  not generated `target/` contents.
- Treat the ordinary Tauri build as the lightweight installer and sole updater
  input. Build the full first-install overlay separately, upload its renamed
  manual installer without updater metadata, and keep its embedding seed out of
  every `latest.json` target.
- Treat SDK server releases as independent process resources for headless and
  third-party consumers. Keep their machine-readable manifest, target matrix,
  protocol range, byte sizes, and SHA-256 values aligned. Desktop release builds
  additionally package the exact pinned server as an `externalBin` fallback and
  publish only those release-qualified binaries through a fixed runtime channel
  whose manifest has a detached signature from the Tauri updater trust root.
  Ordinary public CI artifacts and caches must still never expose private SDK
  outputs. Do not describe the channel as an active desktop hot update until the
  host supervisor and transport extraction are complete.
- Publish the platform-independent frontend archive, bounded manifest, and
  detached signature only from the release-qualified static build. Refresh the
  matching fixed `frontend-beta`, `frontend-rc`, or `frontend-stable` channel
  after the immutable release is public.
- During Tauri development, pass the selected Vite URL as a CLI configuration
  layer and stage rebuilt helper resources only when their bytes change.

Use `deliver-via-pr` for repository delivery. Its preflight and CI handoff rules
remain authoritative; do not duplicate ordinary CI locally.
