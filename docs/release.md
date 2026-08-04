# Release Process

This repository uses Conventional Commits, SemVer, release pull requests, and
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
choose `beta` or `stable`. Beta is the default, uses the current verified
`master` head, and opens its generated metadata PR back to `master`.

Stable requires an explicit published `vX.Y.Z-beta.N` tag and never silently
selects the latest Beta. The workflow creates `release/stable/X.Y.Z` from that
immutable Beta commit, adds one commit that refreshes only release automation
and its tests/docs, and opens the Stable metadata PR to that
branch. Product source remains byte-for-byte aligned with the selected Beta
without restoring old application code into a newer `master`. The merged Stable
branch is also the durable source snapshot for that version.

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

The selected release channel controls the suffix and GitHub Release state. The
release-relevant Conventional Commits control the `X.Y.Z` base version:

- From a stable tag, `beta` calculates `X.Y.Z` from Conventional Commits and
  creates `vX.Y.Z-beta.1`.
- From a beta tag, `beta` applies a new Conventional Commit bump to `X.Y.Z`
  and resets the suffix to `beta.1`. If there is no new release-worthy bump,
  it keeps `X.Y.Z` and increments the Beta number.
- The next Beta number is calculated from matching immutable tags and the
  baseline version. Checked-in version files may lag during migration from the
  legacy divergent release lines; they are reconciled by the next Beta PR.
- Stable preparation requires an explicit `vX.Y.Z-beta.N` tag. Its release line
  is derived from the tag, and the target is always the matching immutable
  `vX.Y.Z`; Stable preparation never silently selects the latest Beta.

If legacy history contains both a stable tag and later beta tags with the same
`X.Y.Z`, the suffix cannot be removed safely. The script detects that collision
and recalculates from the existing stable tag instead of overwriting it.

## Release Sources and Pull Requests

A Beta preparation run requires the exact `master` head SHA to have a
successful push CI run. The workflow requires successful change detection and
the `CI / Required` aggregate, which proves that every module selected by the
path router passed. It then creates an ephemeral `prepare/vX.Y.Z-beta.N` branch
and opens a pull request back to `master`.

A Stable preparation requires its selected Beta tag to be a published
prerelease. `release/stable/X.Y.Z` starts from that tag, contains one
automation-refresh commit that cannot touch product paths, and the ephemeral
`prepare/vX.Y.Z` branch adds one Stable metadata commit. A pre-existing Stable
source branch is reusable only while the selected tag remains its ancestor and
its product tree still matches that tag; product drift stops preparation.

Ordinary Beta preparation adds one `chore: release vX.Y.Z-beta.N` commit that
changes only:

- `.github/release.json`
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `CHANGELOG.md`

Stable preparation accepts any published Beta tag, not only its newest tag.
Because its target branch starts at that exact tag, the release commit changes
only the version, updater channel, manifest, and changelog. Verification compares
the resulting product source with the selected Beta tag and allows differences
only in generated release files.

If a retry finds the same `prepare/vX.Y.Z...` branch, it verifies that branch's
metadata, channel, selected source, exact one-commit shape, and current base
before reusing it; it also reuses an already-open release PR. An existing
immutable release tag stops preparation. The workflow explicitly dispatches CI
for the preparation head SHA.
GitHub requires approval for a normal `pull_request` workflow created with
`GITHUB_TOKEN`, so the explicit dispatch provides the release check immediately.

Change detection recognizes a one-commit release as generated metadata and
reuses the successful source CI instead of rerunning frontend and Rust suites.
The automation check verifies that:

- all four runtime version fields match the requested tag;
- Beta/Stable updater endpoints match the selected channel;
- JSON manifests contain no unrelated edits;
- Cargo files change only the OpenAgent package version;
- the release commit contains every expected file and no unexpected file.
- `sourceSha` identifies the direct Beta source parent or the selected immutable
  Beta tag, and `previousTag` exists;
- a Stable promotion declares a Beta source whose `X.Y.Z` matches the Stable
  target, and its product source matches that tag outside generated files.

Review and merge the PR only after `CI / Required` passes.

## Publishing

Merging a Beta PR creates a normal push to `master`; merging a Stable PR creates
a push to `release/stable/X.Y.Z`. CI validates the exact merge SHA. After the
successful `CI` workflow completes, `release.yml` accepts Beta markers only from
`master` and Stable markers only from `release/stable/*`, repeats metadata and
source-integrity validation, and creates an annotated tag pointing to that same
SHA. The detection checkout includes complete tag history because release
metadata validation resolves `previousTag` against local immutable tag refs.
Pushes to ephemeral `prepare/*` or Beta archive branches cannot publish.

Only then does it:

1. create or reuse a draft GitHub Release;
2. build the complete application once for Windows x64, Linux x64, macOS
   arm64, and macOS Intel;
3. upload signed updater and installer artifacts;
4. publish the draft after every target succeeds;
5. update the fixed Beta updater metadata when applicable;
6. fast-forward `release/beta/X.Y` to the published Beta SHA when applicable;
7. deploy the release landing page with the published tag.

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

The Release workflow does not repeat frontend tests, Rust tests, linting, or an
isolated smoke binary. It builds the exact source SHA that already passed CI and
promotes those artifacts without rebuilding them.

## Modular CI

`ci.yml` classifies changed paths before calling reusable workflows:

- Pull requests and pushes to `master` or `release/stable/*` run every module
  selected by the exact base-to-head path delta. The always-present aggregate
  proves that every selected module passed; release preparation validates both
  change detection and that aggregate instead of requiring unrelated modules.
- Frontend source and browser-independent tests run once on Linux.
- Rust and Tauri changes run Rust quality checks, Rust tests, and a complete
  desktop build on Linux, Windows, and macOS.
- Workflow changes select every module.
- Generated release metadata runs only its strict integrity check before and
  after merge. Its manifest binds the release commit to an already-verified
  source SHA, avoiding a second frontend/native matrix for metadata-only Beta
  increments.
- Creation of a Stable archive branch reports an all-zero GitHub `before` SHA;
  change detection falls back to the branch head's parent instead of treating
  the existing Beta snapshot as an entirely new repository.
- Documentation-only changes skip expensive modules.

The always-present `CI / Required` job remains the authoritative aggregate for
each CI run. GitHub attaches a `pull_request` workflow to a generated merge SHA,
which is replaced whenever an active `master` advances. A trusted
`workflow_run` reporter therefore copies only the latest completed PR CI
conclusion to `Required PR Head` on the immutable PR head SHA. Superseded runs
cannot overwrite a newer conclusion. The branch ruleset requires this stable
head status with strict up-to-date checking disabled, so unrelated merges do
not erase a completed PR's validation and force the entire matrix to repeat.

The repository is owned by a personal account, for which GitHub does not offer
native merge queues. If ownership moves to an organization, prefer a native
merge queue and keep the existing `merge_group` CI trigger so the queued merge
commit is tested against the latest target branch.

Private SDK changes use the public `sdk-ci.yml` workflow so their Rust,
Harness, host-compatibility, and native process-sandbox jobs run on public
runners. Linux sandbox tests run on Ubuntu 24, install Bubblewrap, disable only
that image's AppArmor restriction on unprivileged user namespaces, and enable
the real filesystem boundary test; a dedicated macOS job exercises the system
Seatbelt boundary.
Both are required by the aggregate rather than being optional smoke checks.
The Windows job enables every Windows Firewall profile before exercising the
offline account. It verifies Codex's two network layers separately: the
user-scoped Firewall rules block arbitrary loopback traffic, and the persistent
WFP filters still block DNS port 53 when ordinary local binding is allowed.
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
on the private SDK commit. That Check Run contains the captured command output
and is visible only through the private repository. Delivery failures remain
generic warnings in the public run; arbitrary captured output must never be
placed in public logs, step summaries, artifacts, or caches.

The public repository stores the reporter App ID in
`OPENAGENT_CI_REPORTER_APP_ID` and its private key in
`OPENAGENT_CI_REPORTER_PRIVATE_KEY`; the App installation is limited to the
private SDK repository. Its repository permissions are limited to read-only
contents plus write access to commit statuses and checks. The status permission
owns the aggregate `Public SDK CI` gate, while the checks permission owns the
private failure diagnostics.

The private dispatcher also sends capability booleans derived from its own
base-to-head path delta. Rust formatting, lint, tests, Linux/macOS sandbox
checks, TypeScript SDK checks, the Linux/Windows Harness matrix, and public-host
compatibility are independent jobs. GitHub's failed-job rerun therefore repeats
only failed capabilities and the aggregate status. Dependency caches may hold
Cargo registry/git data and Bun's public package downloads, but every Rust cache
must set `cache-targets: false`; private target or compiler outputs remain
forbidden in public caches. A host-repository SDK gitlink update still selects
every public consumer capability because that repository cannot infer the
private path delta from the gitlink alone.

## Local Commands

Release automation changes must pass both `bun run lint:frontend` and
`bun run lint:actions`. These checks reject warnings as well as errors, including
unused JavaScript and shell variables in release scripts and workflow steps.

Dry runs can execute on any branch:

```bash
bun run release:beta:dry-run
bun run release:stable:dry-run
```

To prepare a Beta release commit locally, create a preparation branch from
`master`:

```bash
git switch -c prepare/v0.31.0-beta.1 master
bun run release:prepare:beta
```

To reproduce Stable preparation locally, create its archive branch at the
selected Beta and name that source explicitly:

```bash
git switch -c release/stable/0.31.0 v0.31.0-beta.2
git restore --source master -- .github/workflows scripts docs/release.md \
  tests/ciChanges.test.js tests/docsSync.test.js \
  tests/releaseCi.test.js tests/releaseVersion.test.js
git add .github/workflows scripts docs/release.md \
  tests/ciChanges.test.js tests/docsSync.test.js \
  tests/releaseCi.test.js tests/releaseVersion.test.js
git commit --allow-empty -m "chore(release): refresh promotion automation"
git switch -c prepare/v0.31.0
bun scripts/release.mjs --channel=stable --promote-beta=v0.31.0-beta.2
```

The script refuses to create release commits outside `release/*` or `prepare/*`
branches or when release-managed files already have uncommitted changes. It
never creates or pushes a tag; tagging belongs exclusively to the post-CI
Release workflow.
