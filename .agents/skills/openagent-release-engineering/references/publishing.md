# Publishing

The direct release commit changes `.github/release.json`, so its push starts the
Release workflow. It accepts Beta markers only from `master`, RC markers only
from `release/rc/*`, and Stable markers only from `release/stable/*`, validates
metadata and source integrity, then starts the complete reusable CI suite and
SDK release orchestration concurrently for that exact SHA. The SDK path builds
each selected Runtime target once; native candidates wait for its staged,
release-qualified binaries and package those exact bytes as Tauri sidecars.
Candidate builds have no release-side effects: they upload only run-scoped
Actions artifacts. Only a successful full result, successful SDK resolution,
and every installer and resource candidate allow the workflow to create the
annotated tag. The detection checkout includes complete tag history because
release metadata validation resolves `previousTag` against local immutable tag
refs.

In parallel with desktop qualification, the workflow resolves the exact `sdk`
gitlink and validates and reuses the corresponding independent SDK release when
available; otherwise it explicitly dispatches current private `main` SDK CI
with the immutable commit SHA, waits for the resulting full public qualification
status, and only then dispatches private SDK release preparation for that
immutable SHA. The host tracks the preparation workflow through completion
before accepting its tag, stages and validates its private Runtime candidate,
and defers every SDK publication side effect until the desktop draft is
complete.
Final SDK publication uses current private `main` automation with the resulting
`sdk-v*` tag as an explicit input, then checks out and verifies the immutable
source. Its public-host reader token is restricted to the explicit host
repository and inherits the dispatcher App installation permissions;
publication must not request a narrower permission override that can disagree
with the installed grant. The SDK release has no npm publication path. The
host tracks the exact child workflow runs, reports their URLs when they fail,
and waits for full SDK qualification plus a published manifest whose `sdk_sha`
and protocol version match. It does not rely on
a tag pushed by `GITHUB_TOKEN` to trigger another workflow. Any failure stops
desktop tagging and publication; already-built private candidates simply expire
with the workflow run. A published desktop release includes
`openagent-desktop-manifest.json`, recording
the desktop version and tag, SDK version, tag and source SHA, protocol range,
and exact host compatibility mapping. This orchestration uses the dedicated
`OPENAGENT_SDK_RELEASE_TOKEN`; private source checkout uses the CI reporter
App's short-lived, read-only installation token over HTTPS.

Candidate construction and publication are separate phases:

Runtime-selected desktop releases run `plugin-releases.yml` after qualification
and before SDK publication. It checks out the immutable qualified SDK contract,
stages pinned standard packages using their checked-in versions without rewriting
manifests, tests the packaged bytes, then publishes or reuses immutable releases.
The [plugin versioning contract](../../openagent-plugin-development/references/versioning.md)
owns version decisions, range declarations, reuse and collision checks. The plugin
contract owns repository token requirements. Independent
SDK publication dispatches and waits for this same pipeline on public `master`;
it does not duplicate plugin release logic. Configure the dispatcher App for Actions write
on OpenAgent and the host's `OPENAGENT_PLUGIN_RELEASE_TOKEN` for contents write
on the standard package repositories before enabling release publication.
Release detection requires that plugin token for Runtime-selected releases,
before qualification or candidate builds start; missing publication credentials
must fail at this gate rather than after native packaging.
Plugin tag fetching is restricted to submodules under `plugins/`, including
nested package submodules. The separate immutable SDK checkout deliberately
does not persist its reader credential and must not be fetched by package setup.
Packaged tests run under their declared framework: `node:test` uses Node 24,
and `bun:test` or existing implicit Bun globals use the pinned Bun runner.
`verify-plugin-candidates.mjs` retains every staged test, rejects mixed framework declarations, and
bounds both individual tests and each runner process. This keeps native Node
HTTP/child-process fixtures out of Bun's compatibility test bridge and ensures
a failed fixture cannot leave publication waiting indefinitely on orphan processes.

1. concurrently qualify the desktop SHA and stage or reuse its pinned SDK
   release, including the exact Runtime binaries and manifest;
2. verify the staged SDK SHA, artifact names, sizes, and SHA-256 values, then
   package those bytes into every native candidate without rebuilding
   or retesting the Runtime;
3. store Runtime, frontend, lightweight Tauri, full first-install, and Store
   candidates only as run-scoped Actions artifacts;
4. bind each native candidate manifest to the exact desktop SHA, SDK gitlink
   SHA, target, byte sizes, and SHA-256 values;
   macOS updater archives and signatures include `aarch64` or `x64` in their
   staged asset names so the two candidate artifacts can be merged without
   overwriting one architecture with the other;
5. after every gate succeeds, create the immutable tag and create or reuse the
   draft GitHub Release; every unpublished product release requires successful
   native and complete resource candidates, even when only frontend or Runtime
   source changed. Draft creation must explicitly require successful detection
   and tagging;
   selected component publication jobs must likewise evaluate explicitly after
   skipped non-selected ancestors, and a selected publisher that does not
   succeed must block SDK and desktop publication rather than be treated as an
   acceptable skip;
6. download and verify every installer and resource candidate, upload its
   existing bytes, and generate one combined `latest.json` from the four
   verified native targets;
   complete distribution uploads wait for the Runtime and frontend publishers
   because their resource filenames overlap. Concurrent `--clobber` uploads can
   delete or race another publisher's asset. Unselected component publishers may
   be skipped, but a failed publisher blocks the complete distribution;
7. submit the Store package only after the same gate, publish the staged SDK
   release, upload the desktop-to-SDK mapping, and generate the GitHub Release
   body from the current changelog section and the assets actually attached to
   the draft;
8. publish the desktop draft only after its release body contains the exact
   previous-tag comparison and every expected user-facing installer shortcut;
9. update fixed component channels and, for every prerelease, the
   fixed Beta or RC `latest.json`;
10. fast-forward `release/beta/X.Y` or `release/rc/X.Y` to the published
    prerelease SHA when applicable;
11. deploy the release landing page with the published tag.

The published GitHub Release body embeds only the current version's generated
`CHANGELOG.md` section, links the exact `previousTag...tag` comparison, and
summarizes the selected frontend, Runtime, and native-shell components. Every
product release also provides direct, described download links for the
lightweight and full Windows installers, Apple Silicon and Intel
DMGs, and Linux AppImage, DEB, and RPM packages. Missing or duplicate expected
installer assets stop publication. Installer shortcuts match the OpenAgent
product prefix and exact manifest version before platform suffixes; distribution
helpers such as `codex-windows-sandbox-setup.exe` and older-version installers
cannot qualify as desktop downloads. Frontend-only and Runtime-only source
releases rebuild installers with the current product version and exact signed
resource distribution; their download
tables obey the same completeness gate. Component selection continues to
control fixed frontend and Runtime channels, while every product release
refreshes installer updater metadata and eligible Stable Store packages.
Signatures, updater manifests, and developer-facing component resources remain
in the GitHub Assets list rather than the quick-download table.

Release binaries use the repository's size-oriented Cargo profile: full link-time
optimization, one codegen unit, size optimization, abort-on-panic, stripped
symbols. Windows desktop releases produce lightweight and `full` NSIS
installers. The lightweight NSIS artifact and its signature are the only inputs
referenced by `latest.json`; the full installer is a manual first-install option
and does not produce updater metadata. WiX/MSI is not part of the release
surface. The native
verification dependency remains registered in the host but compiles its named
pipe server and injected WebView automation bridge only for debug builds;
release builds receive the plugin's no-op implementation. The Windows
platform Tauri configuration is also the sole owner of the `codex-resources/`
mapping, so Windows sandbox helpers cannot leak into a Linux or macOS application
bundle. Linux and macOS likewise publish one additional `full` AppImage or DMG.
The embedding seed exists only in those full manual-download artifacts and the
Microsoft Store package. Automatic application updates are always lightweight
and preserve the verified model under `OPENAGENT_HOME`.
The desktop capability uses Tauri's `updater:default` permission set because
the updater client downloads and installs shell updates as separate commands.

Prerelease updater channel tags and download URLs use the lowercase manifest
values `beta` and `rc`. GitHub release tags and asset URLs are case-sensitive,
so the release workflow must pass the manifest channel through unchanged when
creating a prerelease updater channel release, uploading `latest.json`, and
verifying its public URL. Frontend-only and Runtime-only source releases also
refresh Tauri updater metadata for their rebuilt, versioned installers. The
packaged updater endpoint uses the same lowercase channel name.

Fixed Runtime channels copy the exact manifest and detached signature from the
qualified immutable desktop release, plus every server and sandbox helper named
by that manifest. `scripts/runtime-channel-artifacts.mjs` selects those assets
and verifies the manifest signature and each byte size and SHA-256 before the workflow uploads anything to
the channel. Never select only `openagent-server-*` or use a fixed file count:
a signed manifest that names missing helpers makes production update preparation
fail even when the server binaries and signature are present. To repair an
incomplete channel, preserve its signed manifest bytes and copy only matching
assets from that manifest's immutable `release_version` release, checking size
and SHA-256 before upload.

The Linux target first builds `codex-bwrap` from the immutable Codex revision
pinned by the SDK, strips the helper, and exports its SHA-256 before Tauri
compiles the application. The release binary embeds that digest and verifies
the bundled helper before execution; `tauri.linux.conf.json` packages the same
file as the `bwrap` sidecar. A missing digest, helper, executable bit, or byte
mismatch must fail the build or sandbox launch rather than fall back to an
unverified bundled binary.
