# Release Process

This repository uses Conventional Commits, SemVer, direct release commits, and
immutable release tags.

## Commit Messages

Commit messages are validated by the versioned Git hook in
`.githooks/commit-msg`. Run `bun install` or
`node scripts/install-git-hooks.mjs` once to set `core.hooksPath`.

Valid examples:

```text
feat(chat): add streaming retry
fix: handle missing workspace
feat!: remove deprecated config field
```

## Version Bumps

Development commits and Beta release metadata land on `master`. Ordinary
pushes never create a version or tag by themselves. Start `Prepare Release` and
choose `beta`, `rc`, or `stable`. Beta is the default, uses the current `master` head,
and pushes its generated metadata commit directly back to `master`. The job
fetches `origin/master` again immediately before resolving that immutable base;
if `master` advances after resolution, the direct push fails instead of
publishing stale source.

If the current Beta metadata has not produced its immutable tag yet and later
automation-only commits advance `master`, another preparation run keeps that
unpublished version and writes a marker-only refresh whose `sourceSha` is the
latest `master` commit. Verification permits this narrow retry only when the
prior release identity is unchanged, the old source is an ancestor of the new
source, and `.github/release.json` is the only changed file. New releases still
have to update every generated release file together.

RC requires an explicit published `vX.Y.Z-beta.N` tag and never silently
selects the latest Beta. The workflow creates `release/rc/X.Y.Z` from that
immutable Beta commit. Stable in turn requires an explicit published
`vX.Y.Z-rc.N` tag and creates `release/stable/X.Y.Z` from that immutable RC
commit. Each promotion adds one commit that refreshes only release automation
and its tests/docs, and pushes the Stable metadata commit directly to that
branch. Product source remains byte-for-byte aligned with the selected Beta
without restoring old application code into a newer `master`. The Stable branch
is also the durable source snapshot for that version.

For Beta preparation, `scripts/release.mjs` selects the highest immutable
SemVer tag across all release branches. It uses that tag's merge base with
`master` as the previous product source, then inspects release-relevant commits
to the selected `master` head and applies:

- `major`: any breaking commit, such as `feat!:` or a `BREAKING CHANGE:` footer
- `minor`: any `feat`
- `patch`: any `fix` or `perf`
- no release: docs, chore, refactor, style, test, and ci-only changes

An update to the pinned private `sdk` gitlink is release-relevant. Its
Conventional Commit subject therefore participates in the same bump rules as
application source changes.

The private SDK also has its own release train for headless and third-party
consumers. An immutable `sdk-vX.Y.Z` release publishes the thin Harness package,
platform `openagent-server` binaries, and `openagent-sdk-manifest.json` with the
compatible protocol range, size, and SHA-256 for every target. That release does
not require a desktop installer update. The desktop still embeds the runtime, so
desktop runtime changes remain application updates until the supervised-process
boundary in [modular-updates.md](modular-updates.md) is complete.

The selected release channel controls the suffix and GitHub Release state. The
release-relevant Conventional Commits control the `X.Y.Z` base version:

- From a stable tag, `beta` calculates `X.Y.Z` from Conventional Commits and
  creates `vX.Y.Z-beta.1`.
- From a beta tag, `beta` applies a new Conventional Commit bump to `X.Y.Z`
  and resets the suffix to `beta.1`. If there is no new release-worthy bump,
  it keeps `X.Y.Z` and increments the Beta number.
- The next Beta number is calculated from matching immutable tags and the
  baseline version. Checked-in version files may lag during migration from the
  legacy divergent release lines; they are reconciled by the next Beta release.
- RC preparation requires an explicit `vX.Y.Z-beta.N` tag and creates the
  matching `vX.Y.Z-rc.N`; Stable preparation requires an explicit
  `vX.Y.Z-rc.N` tag and creates the matching immutable `vX.Y.Z`.

If legacy history contains both a stable tag and later beta tags with the same
`X.Y.Z`, the suffix cannot be removed safely. The script detects that collision
and recalculates from the existing stable tag instead of overwriting it.

## Release Sources and Direct Pushes

A Beta preparation run creates one generated release commit on the exact
current `master` head. The administrator credential pushes that commit directly
to `master`; a concurrent update rejects the push instead of releasing stale
source.

A promotion requires its selected prerelease tag to be published.
`release/rc/X.Y.Z` starts from its Beta tag and `release/stable/X.Y.Z` starts
from its RC tag; each contains one
automation-refresh commit that cannot touch product paths, and receives one
Stable metadata commit directly. A pre-existing Stable source branch is
reusable only while the selected tag remains its ancestor and its product tree
still matches that tag; product drift stops preparation.

Ordinary Beta preparation adds one `chore: release vX.Y.Z-beta.N` commit that
changes only:

- `.github/release.json`
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `CHANGELOG.md`

RC and Stable preparation accept any published source tag, not only the newest.
Because the target branch starts at that exact tag, the release commit changes
only the version, updater channel, manifest, and changelog. Verification compares
the resulting product source with the selected Beta tag and allows differences
only in generated release files.

Preparation uses a temporary local `prepare/v*` branch only because the release
script restricts where it may create generated commits. No preparation branch
or pull request is pushed. An existing immutable release tag stops preparation.
The `ADMIN_MERGE_TOKEN` secret is required and must identify an administrator
whose ruleset bypass mode is `always`, so the generated commit can update the
target branch directly.

The release metadata verifier checks that:

- all four runtime version fields match the requested tag;
- Beta/RC/Stable updater endpoints match the selected channel;
- JSON manifests contain no unrelated edits;
- Cargo files change only the OpenAgent package version;
- the release commit contains every expected file and no unexpected file.
- `sourceSha` identifies the direct Beta source parent or the selected immutable
  Beta tag, and `previousTag` exists;
- a Stable promotion declares a Beta source whose `X.Y.Z` matches the Stable
  target, and its product source matches that tag outside generated files.

## Publishing

The direct release commit changes `.github/release.json`, so its push starts the
Release workflow. It accepts Beta markers only from `master`, RC markers only
from `release/rc/*`, and Stable markers only from `release/stable/*`, validates metadata and source integrity, then calls
the complete reusable CI suite for that exact SHA. Only a successful full result
allows the workflow to create the annotated tag or begin platform builds. The
detection checkout includes complete tag history because release metadata
validation resolves `previousTag` against local immutable tag refs.

Only then does it:

1. create or reuse a draft GitHub Release;
2. build the lightweight application for Windows x64, Linux x64, macOS arm64,
   and macOS Intel;
3. upload its signed updater metadata and installer artifacts, then build and
   upload one additional full first-install bundle per target;
4. publish the draft after every target succeeds;
5. update the fixed Beta or RC updater metadata when applicable;
6. fast-forward `release/beta/X.Y` or `release/rc/X.Y` to the published prerelease SHA when applicable;
7. deploy the release landing page with the published tag.

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
creating the channel release, uploading `latest.json`, and verifying its public
URL. The packaged updater endpoint uses the same lowercase channel name.

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

The target repository must define `OPENAGENT_SDK_DEPLOY_KEY` and
`TAURI_SIGNING_PRIVATE_KEY`. Release validates both secrets before tagging or
starting platform builds; secret values are never printed.

The Release workflow first runs all frontend, Rust, embedding, sandbox, and
Harness qualification, then performs the authoritative product compilation for
the exact release SHA on every supported target and promotes those same
artifacts without rebuilding them.

## Modular CI

`ci.yml` classifies changed paths before calling reusable workflows and applies
two verification routes:

- Pull requests from contributors without administrator permission and merge
  candidates run fast checks only for modules
  selected by the exact base-to-head path delta. Frontend checks stop after
  type, lint, format, and tests; native checks run host Rust quality and quick
  resource or contract validation without Windows/macOS matrices, embedding
  runtime execution, or Harness server integration.
- Administrator-authored PRs perform only a repository-permission check, then
  publish the successful aggregate without module checks or review. Ordinary
  pushes to `master` do not trigger CI.
- Release workflow calls, nightly schedules, and manual dispatches force every
  module through complete qualification: frontend production build and bundle
  budgets, Windows/macOS native compilation, embedding runtime tests, and
  Harness integration. Full runs never consume prior fast coverage.
- Workflow-router and shared dependency changes still conservatively select
  every affected module; the verification tier controls whether those modules
  use their quick or complete checks.
- The default-branch `workflow_run` reporter publishes `Required PR Head` for
  pull requests only. It may publish reusable fast capability contexts for
  contributor PRs; administrator bypass runs have no capability coverage to
  reuse.
- The always-present aggregate proves that every selected check passed. Release
  qualification selects every check and gates tagging and builds directly.
- Creation of a Stable archive branch reports an all-zero GitHub `before` SHA;
  change detection falls back to the branch head's parent instead of treating
  the existing Beta snapshot as an entirely new repository.
- Documentation-only changes skip expensive modules.

The always-present `CI / Required` job remains the authoritative aggregate for
each CI invocation. For pull requests, a trusted `workflow_run` reporter copies
only the latest conclusion to `Required PR Head` on the immutable head SHA.
Superseded runs cannot overwrite a newer result. When the PR author has
administrator permission, the reporter may squash-merge that exact open,
non-draft head with `ADMIN_MERGE_TOKEN`; the permission route intentionally
contains no module checks. Third-party PRs continue to require their fast CI and
normal review policy. Both default-branch rulesets must grant the administrator
actor `always` bypass so direct pushes and administrator PR merges do not wait
for status or review.

The repository is owned by a personal account, for which GitHub does not offer
native merge queues. If ownership moves to an organization, prefer a native
merge queue and keep the existing `merge_group` CI trigger so the queued merge
commit is tested against the latest target branch.

SDK release tags, nightly schedules, and manual full dispatches use the public
`sdk-ci.yml` workflow so Rust, Harness, host-compatibility, and native
process-sandbox jobs run on public runners. Ordinary private `main` pushes do
not run CI. Linux sandbox tests run on Ubuntu 24, install Bubblewrap, disable only
that image's AppArmor restriction on unprivileged user namespaces, and enable
the real filesystem boundary test; a dedicated macOS job exercises the system
Seatbelt boundary.
Both are required by the aggregate rather than being optional smoke checks.
The Windows job enables every Windows Firewall profile before exercising the
offline account. It verifies Codex's two network layers separately: after a
parent reachability preflight, the user-scoped Firewall rules block the same
numeric external HTTPS address, and the persistent WFP filters still block DNS
port 53 when ordinary local binding is allowed. Both the public SDK workflow
and the public host's complete native qualification run the same two exact
tests sequentially with detailed setup/wrapper logging enabled only in a Check
Run on the pinned private SDK commit. The host qualification accumulates its
helper build and Windows sandbox test output in the same runner-temporary SDK
log, records that allowlisted log only after a failure, and uses the same
least-privileged reporter App. Public logs retain only the fixed `firewall-*`
or `wfp-dns-*` diagnostic category; they never print, summarize, cache, or
upload the captured private output.
The private repository dispatches an immutable commit SHA; a GitHub App
installed only on the SDK repository lets the public workflow read that
revision and report the aggregate `Public SDK CI` commit status. Because
workflow logs are public, SDK command output is suppressed, build outputs are
never uploaded, and Rust target or compiler-output caches are disabled for jobs
that compile private source. Only generic pass/fail diagnostics or explicitly
allowlisted fixed-category test codes may appear in the public run. Linux and
Windows sandbox tests may expose fixed
`OPENAGENT_LINUX_SANDBOX_DIAGNOSTIC=[a-z-]+` and
`OPENAGENT_WFP_DIAGNOSTIC=[a-z-]+` categories so failed boundary stages can be
identified without revealing commands, paths, environment values, or private
source. When a capability command fails, it records the name of that command's
`sdk-*.log` file; the runner reads only that file from its temporary directory,
redacts values held in sensitive environment variables, limits the retained
output, and creates a failed `Public SDK diagnostics / <capability>` Check Run
on the private SDK commit. That Check Run contains the captured command output,
links back to its public runner invocation, and is visible only through the
private repository. If GitHub rejects the Check Run request, the public runner
may expose only the sanitized HTTP status and GitHub API message needed to
diagnose the delivery path; it must never expose the captured command output.
Arbitrary captured output must never be placed in public logs, step summaries,
artifacts, or caches.

The public repository stores the reporter App ID in
`OPENAGENT_CI_REPORTER_APP_ID` and its private key in
`OPENAGENT_CI_REPORTER_PRIVATE_KEY`; the App installation is limited to the
private SDK repository. Its repository permissions are limited to read-only
contents plus write access to commit statuses and checks. The status permission
owns the aggregate `Public SDK CI` gate, while the checks permission owns the
private failure diagnostics. The public workflow requests those three token
permissions explicitly so an App configuration drift fails at token creation
instead of silently producing a token that cannot deliver private diagnostics.

The private dispatcher forces every capability for release, nightly, and manual
runs. Rust formatting, lint, tests, Linux/macOS sandbox checks, TypeScript SDK
checks, the Linux/Windows Harness matrix, and public-host compatibility remain
independent jobs. Public-host compatibility materializes the configured empty
`frontendDist` before native compilation; frontend type checking remains
separate and does not need to produce a release build. The SDK Release workflow
waits for the exact description `Public SDK full validation passed` before any
build or publish job. GitHub's
failed-job rerun therefore repeats only failed capabilities and the aggregate
status. Dependency caches may hold
Cargo registry/git data and Bun's public package downloads, but every Rust cache
must set `cache-targets: false`; private target or compiler outputs remain
forbidden in public caches. A host-repository SDK gitlink update still selects
every public consumer capability because that repository cannot infer the
private path delta from the gitlink alone.

## Local Commands

Release automation changes must pass both `bun run lint:frontend` and
`bun run lint:actions`. These checks reject warnings as well as errors, including
unused JavaScript and shell variables in release scripts and workflow steps.
Dynamic values embedded in Bash parameter-expansion patterns must be quoted
separately so ShellCheck does not treat their contents as glob syntax.

Dry runs can execute on any branch:

```bash
bun run release:beta:dry-run
 bun run release:rc:dry-run
bun run release:stable:dry-run
```

To prepare a Beta release commit locally, create a preparation branch from
`master`:

```bash
git switch -c prepare/v0.31.0-beta.1 master
bun run release:prepare:beta
```

To reproduce RC preparation locally, create its archive branch at the selected
Beta and name that source explicitly. Stable follows the same procedure from
the selected RC tag with `--promote-rc`:

```bash
git switch -c release/rc/0.31.0 v0.31.0-beta.2
git restore --source master -- .github/workflows scripts docs/release.md \
  tests/ciChanges.test.js tests/docsSync.test.js \
  tests/releaseCi.test.js tests/releaseVersion.test.js
git add .github/workflows scripts docs/release.md \
  tests/ciChanges.test.js tests/docsSync.test.js \
  tests/releaseCi.test.js tests/releaseVersion.test.js
git commit --allow-empty -m "chore(release): refresh promotion automation"
git switch -c prepare/v0.31.0-rc.1
bun scripts/release.mjs --channel=rc --promote-beta=v0.31.0-beta.2
```

The script refuses to create release commits outside `release/*` or `prepare/*`
branches or when release-managed files already have uncommitted changes. It
never creates or pushes a tag; tagging belongs exclusively to the post-CI
Release workflow.
