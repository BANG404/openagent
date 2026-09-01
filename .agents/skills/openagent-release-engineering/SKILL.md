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
- Release, nightly, and manual full qualification force every frontend,
  automation, native, embedding, and Harness capability. Release candidate
  builds may run concurrently with qualification, but a failed qualification
  stops tagging and every publication side effect.
- Private SDK manual CI supports fast path classification against the requested
  commit's first parent when `full` is cleared. Keep fast and full commit-status
  contexts separate, retain a full default for older callers, and require
  host-driven release orchestration to pass `full=true`.
- Qualify an exact SDK revision before creating its immutable release tag. A
  failed candidate advances to a new commit and tag; never move the old tag or
  bypass its failed gate.
- Treat the private SDK gitlink as release-relevant input. Private SDK output
  must not leak into public logs or public caches; keep GitHub Rust caches at
  `cache-targets: false`. Compiler outputs may use only the authenticated
  private sccache backend, and release Runtime artifacts may leave public jobs
  only through the documented exact-run publication path.
- An unpublished prerelease refresh may advance only to a descendant source,
  broaden its component selection, and regenerate its current changelog
  section. Keep its version, tag, channel, older changelog history, and already
  selected components stable; unrelated generated-file changes must fail.
- Authenticate trusted private SDK checkouts with a short-lived, read-only
  GitHub App installation token over HTTPS. Do not make CI depend on outbound
  SSH port 22 or retain a long-lived deploy key for source checkout.
- Route trusted Linux, Windows, and macOS native, Public SDK, release
  preparation, and release jobs exclusively to standard GitHub-hosted runners.
  Keep the Cloudflare-to-MinIO compiler cache authenticated and treat it as an
  optimization rather than a correctness dependency. Fork pull-request code
  must not receive private SDK or sccache credentials.
  Use the explicit CI-only sccache server port documented in the workflows on
  Unix. Windows can reserve ports without a visible listener, so
  select an available loopback port per job instead of relying on either the
  default or a fixed replacement. Clear stale Unix server state and briefly
  wait for release before exporting each job's cache settings. Unix compiler
  invocations may auto-start the job-scoped background server. Windows compiler
  invocations do the same on the selected per-job port; do not route rustc
  through a batch wrapper because feature-heavy crates can exceed `cmd.exe`'s
  command-line limit. Runner job cleanup owns the server process lifetime; do
  not use
  `SCCACHE_NO_DAEMON`, which keeps the server in the foreground and blocks
  compiler clients.
- Keep embedded ShellCheck directives parser-compatible: put only supported
  directive syntax on the `# shellcheck` line and place any rationale in a
  separate comment. CI may use a newer `github-actionlint` and ShellCheck than
  the local dependency cache. Windows actionlint does not run the Linux
  ShellCheck integration, so validate changed workflow Bash with the repository's
  Linux actionlint container path before treating the local result as complete.
  Keep multiline JSON producers separate from quoted `curl` command
  substitutions; ShellCheck 0.11 can misparse a producer-to-request pipeline
  nested inside one assignment.

## Host and helper artifacts

- Native CI that compiles Tauri without the frontend build must materialize the
  configured `frontendDist` and target-named placeholders for configured
  `externalBin` resources; frontend qualification and release component builds
  own the production bytes.
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
- Build release candidates from the exact desktop SHA before creating its tag.
  Keep candidate installers private in run-scoped Actions artifacts, bind every
  platform manifest to the desktop and SDK SHAs, and verify all sizes and
  SHA-256 values after download. Only the post-qualification gate may create the
  immutable tag, upload assets, generate the combined `latest.json`, submit a
  Store package, update fixed channels, or publish the GitHub Release.
- Treat SDK server releases as independent process resources for headless and
  third-party consumers. Keep their machine-readable manifest, target matrix,
  protocol range, byte sizes, and SHA-256 values aligned. Desktop release builds
  first resolve the exact SDK gitlink SHA and either reuse its newest valid
  ancestor release when no SDK Conventional Commit requires a bump, or trigger
  an immutable release tag on that exact SHA, explicitly dispatch current SDK CI
  automation with the immutable SHA, dispatch current SDK publication automation
  with the tag as an explicit input, and track the resulting workflow runs through
  full public SDK qualification. Never rely on a tag pushed by `GITHUB_TOKEN` to
  trigger another workflow. A failed or mismatched SDK manifest stops desktop tagging.
  Publish only `@bang404/openagent-harness` to npm; keep the product TypeScript
  client private and distribute it only as pinned source or a checksummed
  development snapshot. The release-qualified server remains the executable
  agent implementation paired with the Harness package.
  Publish an exact desktop-to-SDK mapping manifest with the desktop release.
  additionally package the exact pinned server as an `externalBin` fallback and
  publish only those release-qualified binaries through a fixed runtime channel
  whose manifest has a detached signature from the Tauri updater trust root.
  Ordinary public CI artifacts and caches must still never expose private SDK
  outputs. The release desktop activates verified candidates through the
  supervised external Runtime transaction.
- Resolve the checked-out SDK directory once before invoking SDK-owned release
  scripts. Use that absolute root for both the script path and working directory
  so a relative checkout path is not applied twice.
- Trusted nightly and explicit full SDK qualification may refresh the public
  `runtime-dev` channel after the exact private `main` commit passes. That
  channel may contain only signed Runtime manifests, release-built server
  binaries, the behavior-free TypeScript SDK snapshot, and the public Harness
  package. Fork pull requests may consume the exact checksummed TypeScript
  snapshot for frontend checks; never expose private Rust sources, credentials,
  caches, diagnostics, or an artifact for a different gitlink SHA.
- Publish the platform-independent frontend archive, bounded manifest, and
  detached signature only from the release-qualified static build. Refresh the
  matching fixed `frontend-beta`, `frontend-rc`, or `frontend-stable` channel
  after the immutable release is public.
- Treat Tauri signer `.sig` files as Base64-wrapped minisign text. Resource
  installers must decode that standard wrapper, verify the exact manifest bytes
  before downloading artifacts, and retain integration coverage with an
  ephemeral test key; never require or print the production signing key locally.
- Record `frontend`, `runtime`, and `nativeShell` in release metadata. Component
  releases build only their selected resources; only `nativeShell` builds Tauri
  updater artifacts, full installers, Store packages, or fixed `latest.json`.
  RC and Stable promotions inherit the source component set, and legacy
  manifests without it conservatively select every component.
- During Tauri development, pass the selected Vite URL as a CLI configuration
  layer and give the Cargo runner a stable external target directory derived
  from the worktree plus `OPENAGENT_HOME`. This prevents Windows from locking a
  different worktree or task fixture to the same `target/debug/openagent.exe`
  while preserving incremental compilation for repeated runs. Respect an
  explicit `CARGO_TARGET_DIR`, leave custom runners untouched, and do not leak
  the derived directory into helper or private Runtime builds. Stage rebuilt
  helper resources only when their bytes change. Ordinary development also
  prepares and supervises the debug Runtime sidecar by default; keep embedded
  composition as an explicit diagnostic command rather than a silent fallback.
  Watch private Runtime Rust and Cargo inputs through the development command,
  finish rebuilding and staging changed server bytes before signaling Tauri to
  reload, and never let Tauri's direct source watcher restart against a stale
  sidecar. A failed server build keeps the current process running and retries on
  the next source change.

Use `deliver-via-pr` for repository delivery. Its preflight and CI handoff rules
remain authoritative; do not duplicate ordinary CI locally.
