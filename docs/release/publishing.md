# Publishing

The direct release commit changes `.github/release.json`, so its push starts the
Release workflow. It accepts Beta markers only from `master`, RC markers only
from `release/rc/*`, and Stable markers only from `release/stable/*`, validates
metadata and source integrity, then starts the complete reusable CI suite, SDK
release orchestration, and selected release candidate builds concurrently for
that exact SHA. Candidate builds have no release-side effects: they upload only
run-scoped Actions artifacts. Only a successful full result, successful SDK
resolution, and every selected candidate allow the workflow to create the
annotated tag. The detection checkout includes complete tag history because
release metadata validation resolves `previousTag` against local immutable tag
refs.

In parallel with desktop qualification and candidate builds, the workflow
resolves the exact `sdk` gitlink and validates and reuses the corresponding
independent SDK release when available;
otherwise it explicitly dispatches current private `main` SDK CI with the immutable
commit SHA, waits for the resulting full public qualification status, and only
then dispatches private SDK release preparation for that immutable SHA. The host
tracks the preparation workflow through completion before accepting its tag,
stages and validates its private manifest, and defers every public SDK side
effect until the desktop draft is complete. Final SDK publication uses current
private `main` automation with the resulting `sdk-v*` tag as an explicit input,
then checks out and verifies the immutable source. Its public-host reader token is restricted to the explicit
host repository and inherits the dispatcher App installation permissions;
publication must not request a narrower permission override that can disagree
with the installed grant. Private npm publication uses npm Trusted Publishing
from a dedicated GitHub-hosted job with job-scoped `id-token: write`; it retains
no `NPM_TOKEN` or `NODE_AUTH_TOKEN`. Only
`@bang404/openagent-harness` binds `BANG404/openagent-sdk`, `release.yml`, and
the `npm` environment in npm. It requires two-factor authentication without
bypass tokens and uses `npm publish --tag` as the sole registry mutation.
Existing-version retries verify the expected
dist-tag instead of attempting a separately authenticated dist-tag update. The
host tracks those exact child workflow runs,
reports their URLs when they fail, and waits for full SDK qualification plus a
published manifest whose `sdk_sha` and protocol range match. It does not rely on
a tag pushed by `GITHUB_TOKEN` to trigger another workflow. Any failure stops desktop
tagging and publication; already-built private candidates simply expire with
the workflow run. A
published desktop release includes `openagent-desktop-manifest.json`, recording
the desktop version and tag, SDK version, tag and source SHA, protocol range,
and exact host compatibility mapping. This orchestration uses the dedicated
`OPENAGENT_SDK_RELEASE_TOKEN`; private source checkout uses the CI reporter
App's short-lived, read-only installation token over HTTPS.

Candidate construction and publication are separate phases:

1. concurrently qualify the desktop SHA, stage or reuse its pinned SDK release,
   and build every selected platform candidate;
2. store Runtime, frontend, lightweight Tauri, full first-install, and Store
   candidates only as run-scoped Actions artifacts;
3. bind each native candidate manifest to the exact desktop SHA, SDK gitlink
   SHA, target, byte sizes, and SHA-256 values;
   macOS updater archives and signatures include `aarch64` or `x64` in their
   staged asset names so the two candidate artifacts can be merged without
   overwriting one architecture with the other;
4. after every gate succeeds, create the immutable tag and create or reuse the
   draft GitHub Release;
5. download and verify every selected candidate, upload its existing bytes, and
   generate one combined `latest.json` from the four verified native targets;
6. submit the Store package only after the same gate, publish the staged SDK
   release, upload the desktop-to-SDK mapping, and generate the GitHub Release
   body from the current changelog section and the assets actually attached to
   the draft;
7. publish the desktop draft only after its release body contains the exact
   previous-tag comparison and every expected user-facing installer shortcut;
8. update fixed component channels and, for native-shell prereleases only, the
   fixed Beta or RC `latest.json`;
9. fast-forward `release/beta/X.Y` or `release/rc/X.Y` to the published
   prerelease SHA when applicable;
10. deploy the release landing page with the published tag.

The published GitHub Release body embeds only the current version's generated
`CHANGELOG.md` section, links the exact `previousTag...tag` comparison, and
summarizes the selected frontend, Runtime, and native-shell components. When a
release includes the native shell, it also provides direct, described download
links for the lightweight and full Windows installers, Apple Silicon and Intel
DMGs, and Linux AppImage, DEB, and RPM packages. Missing or duplicate expected
installer assets stop publication. Component-only releases explicitly state
that desktop installers are unchanged instead of linking an older installer.
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

Prerelease updater channel tags and download URLs use the lowercase manifest
values `beta` and `rc`. GitHub release tags and asset URLs are case-sensitive,
so the release workflow must pass the manifest channel through unchanged when
creating a native-shell channel release, uploading `latest.json`, and verifying
its public URL. Frontend-only and Runtime-only releases do not create or replace
Tauri updater metadata. The packaged updater endpoint uses the same lowercase
channel name.

The Linux target first builds `codex-bwrap` from the immutable Codex revision
pinned by the SDK, strips the helper, and exports its SHA-256 before Tauri
compiles the application. The release binary embeds that digest and verifies
the bundled helper before execution; `tauri.linux.conf.json` packages the same
file as the `bwrap` sidecar. A missing digest, helper, executable bit, or byte
mismatch must fail the build or sandbox launch rather than fall back to an
unverified bundled binary.

### Microsoft Store package

Stable releases also stage and submit one unsigned x64 MSIX through Partner
Center. Beta releases do not submit a Store package. The Store layout must
mirror the Windows desktop bundle's runtime inputs: the main executable, the
agent-server executable, release-root DLLs, and the bundled embedding model.
The packaging step fails before submission when a required staged resource is
missing. Store package versions are independent from the WiX installer version:
Stable SemVer `X.Y.Z` maps to `(X+1).Y.Z.0`. This keeps the required fourth
component at zero, avoids a forbidden zero first component during `0.x`
development, and remains monotonic across later Stable releases.

The native ONNX Runtime used by local semantic retrieval dynamically links the
Visual C++ 14 runtime. Every generated `Package.appxmanifest` therefore declares
`Microsoft.VCLibs.140.00.UWPDesktop` as a framework dependency. Do not assume a
review machine already has `MSVCP140.dll`, copy an arbitrary DLL downloaded
from the internet, or rely on Partner Center to infer this dependency. The
Store installs and services the declared framework package together with both
the first published package and all later updates.

For a rejected first submission, keep the existing Partner Center product and
identity, build a higher four-part MSIX version through the normal Stable
release workflow, and replace the failed submission package. Do not create a
second Store product or change the reserved package identity. Before submitting
manually, inspect `Package.appxmanifest` in the staged layout and confirm the
VCLibs package dependency is present.

The target repository must define the `OPENAGENT_CI_REPORTER_APP_ID` variable
and the `OPENAGENT_CI_REPORTER_PRIVATE_KEY`, `OPENAGENT_SDK_RELEASE_TOKEN`,
and `TAURI_SIGNING_PRIVATE_KEY` secrets. The SDK release token needs workflow
and release access only to the private SDK repository. Release validates these
credentials before tagging or starting platform builds; secret values are never
printed.
Runtime, frontend, and development channel manifests are signed with the Tauri signer. Its
detached `.sig` artifact is the Tauri-standard Base64 wrapper around minisign
text; desktop resource installers decode that wrapper, verify the exact
downloaded manifest bytes against the updater public key, and only then fetch
or activate the referenced artifact. The release workflow passes the validated
passwordless private key and an explicit empty password to every standalone
manifest-signing command, rather than depending on environment-variable
discovery or an interactive password prompt. Local integration tests use an
ephemeral test keypair and never require the production private key.

The Release workflow first runs all frontend, Rust, embedding, sandbox, and
Harness qualification, then performs the authoritative product compilation for
the exact release SHA on every supported target and promotes those same
artifacts without rebuilding them. Each platform matrix entry exports a
dedicated Runtime sidecar target while the native and full bundles run. This
target takes precedence over Tauri's host-oriented environment variables, so
cross-compilation prepares the target-named sidecar instead of the runner
host's sidecar.
