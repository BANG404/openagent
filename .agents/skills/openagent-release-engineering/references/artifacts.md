# Host and helper artifacts

- Native CI that compiles Tauri without the frontend build must materialize the
  configured `frontendDist` and target-named placeholders for configured
  `externalBin` resources before invoking Cargo; frontend qualification and
  release component builds own the production bytes.
  Local preflight must materialize `frontendDist` before both Clippy and the
  host compile check; each invokes Tauri macros even without a frontend build.
  Keep direct native-dialog dependencies from enabling a Linux backend that
  conflicts with the backend selected by `tauri-plugin-dialog`.
- Build platform sandbox helpers from the Codex revision pinned by the SDK.
  Never reset or overwrite a divergent SDK checkout automatically, and never
  mix library, setup-helper, and command-runner revisions. Keep any compiler
  warning override narrowly scoped to that third-party helper build; native
  host and SDK warnings remain errors.
- Windows produces NSIS plus updater artifacts, not WiX. Signed Runtime
  manifests bind the pinned sandbox helpers; installation verifies and places
  them next to that Runtime under `codex-resources/`. Linux's helper is installed
  there as executable `bwrap`. Offline bundles contain the same signed bytes.
- Cua Driver is delivered by the verified Agent Plugin release at
  `https://github.com/BANG404/openagent-cua-driver`; the desktop bundle does
  not package or download a Cua binary.
- Use `bun run tauri:build` for shell release builds; helper compilation and its
  digests belong to the qualified SDK Runtime, outside shell compilation.
  Keep the release Cargo profile size-oriented and audit installer size,
  not generated `target/` contents. The ordinary desktop build must leave the
  `embedded-runtime` Cargo feature disabled; only the explicit embedded
  diagnostic may link the in-process Runtime command adapter.
  Keep its agent-server entry point outside `src-tauri/src/bin/`: Tauri CLI
  scans that directory for bundle binaries even with Cargo `autobins = false`.
  `scripts/embedded-cargo.mjs` declares the diagnostic binary only in its
  generated SDK-owned manifest. Preserve retired source allowlist paths until
  their unpublished history has been delivered.
- Treat the ordinary Tauri build as the lightweight installer and sole updater
  input. Build the full first-install overlay separately, upload its renamed
  manual installer without updater metadata, and keep its embedding seed out of
  every `latest.json` target.
- Build release candidates from the exact desktop SHA before creating its tag.
  Keep candidate installers private in run-scoped Actions artifacts, bind every
  platform manifest to the desktop and SDK SHAs, and verify all sizes and
  SHA-256 values after download. Release jobs may cache Cargo dependencies but
  must not restore `target/` outputs across candidate builds. Before staging a
  Windows candidate, verify the compiled executable's product version; keep the
  required split updater permissions selected through the structured desktop
  capability. Only the post-qualification gate may create the immutable tag,
  upload assets, generate the combined `latest.json`, submit a Store package,
  update fixed channels, or publish the GitHub Release.
- Treat SDK server releases as independent desktop Runtime process resources.
  Keep their machine-readable manifest, target matrix,
  protocol range, byte sizes, and SHA-256 values aligned. Desktop release builds
  first resolve the exact SDK gitlink SHA and either reuse its newest valid
  ancestor release when no SDK Conventional Commit requires a bump, or trigger
  an immutable release tag on that exact SHA, explicitly dispatch current SDK CI
  automation with the immutable SHA, and stage the exact manifest, Runtime
  binaries, and checksums as one private workflow artifact. Tauri release jobs
  must verify and reuse those exact binaries in their signed distributions;
  never compile the pinned Runtime a second time. A failed or mismatched staged
  candidate stops desktop tagging. Publish the SDK tag only after every
  selected desktop candidate is attached to the desktop draft and the remaining
  publication gates pass, then publish the desktop draft. Never rely on a tag
  pushed by `GITHUB_TOKEN` to trigger another workflow.
  Before publishing the desktop draft, generate its body from the exact current
  changelog section, `previousTag...tag` comparison, selected components, and
  the assets attached to that draft. Every product release must expose each
  expected user installer for its exact version as a described direct download
  and fail when one is missing or duplicated, including frontend-only and
  Runtime-only releases. Keep signatures, updater metadata, and component
  resources out of the user-facing download table.
  Keep the product TypeScript client private and distribute it only as pinned
  source or a checksummed development snapshot. The release-qualified server is
  the executable Runtime sidecar used by the desktop host.
  Publish an exact desktop-to-SDK mapping manifest with the desktop release.
  include the exact pinned server in the complete offline resource set and
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
  binaries, pinned sandbox helpers, and the behavior-free TypeScript SDK snapshot. Fork pull requests
  may consume the exact checksummed TypeScript snapshot for frontend checks;
  never expose private Rust sources, credentials,
  caches, diagnostics, or an artifact for a different gitlink SHA.
- Publish the platform-independent frontend archive, bounded manifest, and
  detached signature only from the release-qualified static build. Refresh the
  matching fixed `frontend-beta`, `frontend-rc`, or `frontend-stable` channel
  after the immutable release is public.
- Treat Tauri signer `.sig` files as Base64-wrapped minisign text. Resource
  installers must decode that standard wrapper, verify the exact manifest bytes
  before downloading artifacts, and retain integration coverage with an
  ephemeral test key; never require or print the production signing key locally.
- Record `frontend`, `runtime`, and `nativeShell` in release metadata. These
  flags describe source changes and select fixed frontend/Runtime channel updates;
  they do not gate installer construction. Every product release prepares the
  complete signed Runtime/frontend/embedding/helper distribution and builds all
  four Tauri targets, updater artifacts, full installers, and eligible Stable
  Store packages. Refresh prerelease `latest.json` for every Beta/RC release.
  Tagging requires every candidate unless resuming an already published release;
  SDK and desktop publication require both installer and distribution uploads.
  RC and Stable promotions inherit the source component set, and legacy
  manifests without it conservatively select every component.
- During Tauri development, pass the selected Vite URL as a CLI configuration
  layer and give the Cargo runner a stable external target directory derived
  from the worktree plus `OPENAGENT_HOME`. This prevents Windows from locking a
  different worktree or task fixture to the same `target/debug/openagent.exe`
  while preserving incremental compilation for repeated runs. Respect an
  explicit `CARGO_TARGET_DIR`, leave custom runners untouched, and do not leak
  the derived directory into helper or private Runtime builds. Stage rebuilt
  helper resources only when their bytes change. Ordinary public development
  verifies and supervises its exact signed prebuilt Runtime; explicit source
  development rebuilds the debug Runtime. Keep embedded
  composition as an explicit diagnostic command rather than a silent fallback.
  In source development, watch private Runtime Rust and Cargo inputs through the development command,
  finish rebuilding and staging changed server bytes before signaling a pending
  update. In Tauri development, defer both frontend HMR and the final Tauri reload
  stamp through the Runtime-owned graceful update barrier so an active Agent is
  never cancelled by source refresh. Never let Tauri's direct source watcher
  restart against a stale sidecar. A failed server build keeps the current
  process running and retries on the next source change.

## Online and offline distributions

The ordinary updater/install package embeds only the standalone shell bootstrap.
`tauri.full.conf.json` bundles `resources/bootstrap-release/`, a platform subset
of the immutable signed product distribution. On Windows its NSIS package also
includes WebView2's offline installer. Both packages run the identical shell
executable and import identical component bytes; full packaging does not compile
another product. `distribution-resources` binds signed Runtime and frontend
candidates, pinned sandbox helpers, embedding provenance files, and the exact
TypeScript snapshot. Release publication must gate on
`publish-distribution-resources`. `stage-distribution.mjs` verifies and selects
only the matching platform for offline packaging. The desktop release exposes
`sdk-dev-manifest.json` and all of its public development-kit assets, including
an explicit source-SDK to release-qualified Runtime-SDK mapping.

`build.removeUnusedCommands` stays false: the embedded bootstrap is intentionally
smaller than the downloadable product frontend. Trimming plugin commands against
bootstrap-only assets removes commands the verified product frontend needs after
installation. Capability permissions remain the native authorization boundary.
