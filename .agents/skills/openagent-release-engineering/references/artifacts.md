# Host and helper artifacts

- Native CI that compiles Tauri without the frontend build must materialize the
  configured `frontendDist` and target-named placeholders for configured
  `externalBin` resources before invoking Cargo; frontend qualification and
  release component builds own the production bytes.
  SDK public-host compatibility must also run
  `prepare-node-runtime.mjs` and `prepare-terminal-tools.mjs` before Cargo: Tauri
  validates the configured bundle resource paths even during compile checks.
  Prepare the verified shell resources in both fast and full SDK runs, from the
  checked-out host directory; frontend type checking does not create them.
  Light worktree preparation stages these shell resources without compiling
  Runtime or sandbox helpers. Local preflight prepares and revalidates them and
  materializes `frontendDist` before both Clippy and the host compile check;
  each invokes Tauri macros even without a frontend build. Missing or changed
  resources are repaired through the existing checksummed preparers; failed
  preparation stops before Cargo instead of bypassing resource validation.
  Keep direct native-dialog dependencies from enabling a Linux backend that
  conflicts with the backend selected by `tauri-plugin-dialog`.
- Build platform sandbox helpers from the Codex revision pinned by the SDK.
  Never reset or overwrite a divergent SDK checkout automatically, and never
  mix library, setup-helper, and command-runner revisions. Keep any compiler
  warning override narrowly scoped to that third-party helper build; native
  host and SDK warnings remain errors. Windows keeps the helpers in the
  profile directory of the selected target directory, beside the
  `openagent-server` executable that runs them: Codex's setup orchestrator
  locates `codex-windows-sandbox-setup.exe` relative to its own executable, so
  a build that selects a target triple unconditionally leaves the helpers
  somewhere the orchestrator never searches.
- Windows produces NSIS plus updater artifacts, not WiX. Signed Runtime
  manifests bind the pinned sandbox helpers; installation verifies and places
  them next to that Runtime under `codex-resources/`. Linux's helper is installed
  there as executable `bwrap`. Offline bundles contain the same signed bytes.
- Cua Driver is delivered by the verified Agent Plugin release at
  `https://github.com/BANG404/openagent-cua-driver`; the desktop bundle does
  not package or download a Cua binary.
- Every shell installer and updater bundles the pinned portable Node.js interpreter
  and upstream LICENSE under `node-runtime/`, including the lightweight, full,
  and Store layouts. `prepare-node-runtime.mjs` selects the actual Tauri target
  (including Intel macOS built on ARM), verifies the reviewed archive SHA-256,
  and stages only Node, its license and provenance. Never install system Node,
  npm, or modify the machine PATH. Prepare it before native tests and desktop
  startup; updating the pin requires reviewing upstream SHASUMS and qualifying
  all shell targets. Node belongs to the shell, not the private Runtime resource.
- Every shell installer and updater also bundles portable `rg`, `fd`, `bat`, and
  `sd` under `terminal-tools/`, including lightweight, full, and Store layouts.
  `prepare-terminal-tools.mjs` selects the actual Tauri target, verifies the
  reviewed upstream archive SHA-256 pins in `terminal-tool-releases.mjs`, and
  stages only executables, license notices, and provenance. Linux uses static
  musl assets. Cached preparation rechecks all executables and licenses; a
  failed download or extraction leaves the previous tool set intact. Prepare
  these resources before native tests or desktop startup. Never depend on a
  developer's Codex/Scoop installation, install a package manager, or modify OS
  PATH. Pin updates require all four shell targets and license review. These
  tools belong to the shell and update with its installer, independently of
  Runtime/frontend component updates.
- Use `bun run tauri:build` for shell release builds; helper compilation and its
  digests belong to the qualified SDK Runtime, outside shell compilation.
  Keep the release Cargo profile size-oriented and audit installer size,
  not generated `target/` contents. Qualify the standalone SDK Runtime's release
  footprint separately: shell profile settings cannot optimize a prebuilt
  Runtime. Compare executable and compressed artifact sizes using the same
  source, target and toolchain, and exercise the resulting release binary before
  packaging it. SDK-owned documentation defines its build and inference checks.
  Desktop builds link only public product libraries and supervise the verified
  Runtime binary. There is no embedded engine build manifest or second server
  entry point in the Tauri source tree.
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
  protocol range, byte sizes, and SHA-256 values aligned. Desktop resource staging
  stamps a product-specific Runtime installation identity while preserving SDK
  ordering and exact binary bytes; the [update owner](../../openagent-update-delivery/references/component-updates.md#independent-shell-provisioning-and-shell-first-continuation)
  defines directory reuse and comparison. Independently rebuilt helpers must
  never share an installation directory across product releases.
  Changes to `stage-release-runtime.mjs` select Runtime channel publication.
  Desktop release builds first resolve the exact SDK gitlink SHA and either
  reuse its newest valid
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
  Build the public TypeScript client from the checked-out host source. The release-qualified server is
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
  development rebuilds the debug Runtime. The host has no embedded execution path.
  In source development, watch private Runtime Rust and Cargo inputs through the development command,
  finish rebuilding and staging changed server bytes before signaling a pending
  update. In Tauri development, defer both frontend HMR and the final Tauri reload
  stamp through the Runtime-owned graceful update barrier so an active Agent is
  never cancelled by source refresh. Never let Tauri's direct source watcher
  restart against a stale sidecar. A failed server build keeps the current
  process running and retries on the next source change.

## Parallel release construction and frontend cache

`build-frontend.yml` owns the platform-independent production frontend and shell
bootstrap. It runs both builds and Node-based bundle budgets once, then packs
only `build/` and `.cache/bootstrap-dist/` into `qualified-frontend-build`.
Release qualification delegates this build to the release caller; ordinary full
CI runs invoke it alongside frontend type/lint/test checks. The release tag gate
requires the qualified build even when resuming an already published release.

Bun download caches use the runner OS, pinned Bun version and frozen lockfile.
The frontend output cache is an exact-match optimization: its key binds the
desktop commit, pinned client SDK commit, product version, Bun and Node versions.
Only trusted default-branch runs save production output. No fallback prefix may
restore a different frontend; version and Git revision are embedded in its bytes.
On a miss, build and budget checks run before saving. On a hit, verify source
identity, required entrypoints, the complete file inventory, sizes and SHA-256
before reusing it. Corrupt caches fail qualification rather than silently shipping.
Never cache private SDK sources, Rust outputs, signing keys or fixture state.

`sdk-plan` resolves and persists the SDK release plan once. Runtime staging and
Windows/Linux distribution-helper jobs consume that same plan, including an
ancestor SDK release selected for reuse. Helpers start as soon as that source
is known and compile cold concurrently with SDK qualification. Do not independently
resolve their source after tags change; SDK staging validates the saved plan and
its ancestry against the exact client gitlink.

The four `shell-build` jobs start after the qualified bootstrap, without waiting
for SDK or offline resources. `.github/tauri-prebuilt.conf.json` verifies the
restored frontend and prepares target-specific Node and terminal tools; it never
rebuilds frontend assets. `tauri build --no-bundle` compiles each shell once.
Its run-scoped artifact contains only the main executable, sibling DLLs and
portable resources, with source/target/version identity and file digests.
Private compiler outputs and Cargo target directories are excluded.

Platform packaging waits for the signed distribution and its compiled shell,
verifies every handoff before restoration, restores executable permissions, then
runs `tauri bundle` for lightweight and full layouts using the same executable.
Store staging uses the same signed `bootstrap-release/` resources. All existing
qualification, data compatibility, candidate verification, signing and publication
gates remain required. Validate artifact corruption, wrong source/SDK/target,
missing or escaping paths, executable permissions and the workflow dependency
graph when changing these boundaries. A real hosted release must confirm all four
installer targets and cache-hit/miss timings before claiming a measured speedup.

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
