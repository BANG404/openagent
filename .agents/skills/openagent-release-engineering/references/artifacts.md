# Host and helper artifacts

- Native CI that compiles Tauri without the frontend build must materialize the
  configured `frontendDist` and target-named placeholders for configured
  `externalBin` resources; frontend qualification and release component builds
  own the production bytes.
  Keep direct native-dialog dependencies from enabling a Linux backend that
  conflicts with the backend selected by `tauri-plugin-dialog`.
- Build platform sandbox helpers from the Codex revision pinned by the SDK.
  Never reset or overwrite a divergent SDK checkout automatically, and never
  mix library, setup-helper, and command-runner revisions. Keep any compiler
  warning override narrowly scoped to that third-party helper build; native
  host and SDK warnings remain errors.
- Windows bundles both sandbox helpers only through the Windows Tauri config
  and produces NSIS plus updater artifacts, not WiX. Linux strips
  `codex-bwrap`, embeds its SHA-256 at release compilation, and packages those
  exact bytes through `externalBin`.
- Use `bun run tauri:build` for release builds so generated helper digests reach
  Cargo. Keep the release Cargo profile size-oriented and audit installer size,
  not generated `target/` contents. The ordinary desktop build must leave the
  `embedded-runtime` Cargo feature disabled; only the explicit embedded
  diagnostic may link the in-process Runtime command adapter.
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
  automation with the immutable SHA, and stage the exact manifest as a private
  workflow artifact. A failed or mismatched staged manifest stops desktop
  tagging. Publish the SDK tag only after every selected desktop candidate is
  attached to the desktop draft and the remaining publication gates pass, then
  publish the desktop draft. Never rely on a tag pushed by `GITHUB_TOKEN` to
  trigger another workflow.
  Before publishing the desktop draft, generate its body from the exact current
  changelog section, `previousTag...tag` comparison, selected components, and
  the assets attached to that draft. Native-shell releases must expose each
  expected user installer as a described direct download and fail when one is
  missing or duplicated; component-only releases must say installers are
  unchanged. Keep signatures, updater metadata, and component resources out of
  the user-facing download table.
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
  finish rebuilding and staging changed server bytes before signaling a pending
  update. In Tauri development, defer both frontend HMR and the final Tauri reload
  stamp through the Runtime-owned graceful update barrier so an active Agent is
  never cancelled by source refresh. Never let Tauri's direct source watcher
  restart against a stale sidecar. A failed server build keeps the current
  process running and retries on the next source change.
