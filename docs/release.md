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

Development commits land on `master`; ordinary pushes there never create a
version or tag. Releases are maintained on persistent `release/X.Y` branches.
Start the `Prepare Release` workflow, enter the `X.Y` release line, and choose
`beta` or `stable`. If the release line does not exist, the workflow creates it
from the current `master` commit after requiring that exact commit to have a
successful `CI / Required` run. Subsequent fixes for that version line must be
merged or cherry-picked into `release/X.Y` before preparing another Beta.

For Beta preparation, `scripts/release.mjs` inspects release-relevant commits
on the selected line since its latest reachable `v*` tag and applies:

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
- The next Beta number is calculated from both matching tags and the version
  checked into the repository. This preserves the sequence even when older
  tags are unavailable after repository separation.
- Stable preparation requires an explicit `vX.Y.Z-beta.N` tag from the selected
  release line. The target is always the matching immutable `vX.Y.Z`; Stable
  preparation never silently selects the latest Beta.

If legacy history contains both a stable tag and later beta tags with the same
`X.Y.Z`, the suffix cannot be removed safely. The script detects that collision
and recalculates from the existing stable tag instead of overwriting it.

## Release Lines and Pull Requests

The persistent `release/X.Y` branch is the reviewed source of truth for one
minor release line. A preparation run requires successful CI for its exact head
SHA, then creates an ephemeral `prepare/vX.Y.Z...` branch and opens a pull
request back to `release/X.Y`.

Ordinary Beta preparation adds one `chore: release vX.Y.Z-beta.N` commit that
changes only:

- `.github/release.json`
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `CHANGELOG.md`

Stable preparation accepts any Beta tag reachable from the selected release
line, not only its newest tag. When the selected Beta is older than the line
head, the preparation branch first adds one source-restore commit. That commit
restores release-relevant product source, configuration, dependencies, and the
pinned SDK revision from the selected Beta while retaining current release
automation and documentation. The following release commit changes the version,
updater channel, manifest, and changelog to Stable. Verification compares the
resulting product source with the selected Beta tag and allows differences only
in the generated release files.

If a retry finds the same `prepare/vX.Y.Z...` branch, it verifies that branch's
metadata, channel, selected Beta source, current release-line ancestry, and
one-or-two-commit shape before reusing it; it also reuses an already-open release
PR. An existing immutable release tag stops preparation rather than allowing the
version to be reused. The workflow explicitly dispatches CI for the preparation
head SHA.
GitHub requires approval for a normal `pull_request` workflow created with
`GITHUB_TOKEN`, so the explicit dispatch provides the release check immediately.

Change detection recognizes an ordinary one-commit release as generated
metadata and reuses the successful base CI instead of rerunning frontend and
Rust suites. Restoring an older Beta changes product paths, so CI runs the
affected frontend and native suites again. The automation check verifies that:

- all four runtime version fields match the requested tag;
- Beta/Stable updater endpoints match the selected channel;
- JSON manifests contain no unrelated edits;
- Cargo files change only the OpenAgent package version;
- the release commit contains every expected file and no unexpected file.
- a Stable promotion declares a reachable Beta source whose `X.Y.Z` matches the
  Stable target, and its product source matches that tag outside generated
  release files.

Review and merge the PR only after `CI / Required` passes.

## Publishing

Merging the Release PR creates a normal push to `release/X.Y`. CI validates that
exact merge SHA. After the successful `CI` workflow completes, `release.yml`
listens only to persistent `release/*` branches, checks that the release marker
changed and is ready, repeats the metadata and promotion-source integrity
validation, and creates an annotated tag pointing to that same SHA. Pushes to
ephemeral `prepare/*` branches cannot publish a release.

Only then does it:

1. create or reuse a draft GitHub Release;
2. build the complete application once for Windows x64, Linux x64, macOS
   arm64, and macOS Intel;
3. upload signed updater and installer artifacts;
4. publish the draft after every target succeeds;
5. update the fixed Beta updater metadata when applicable;
6. deploy the release landing page with the published tag.

The target repository must define `OPENAGENT_SDK_DEPLOY_KEY` and
`TAURI_SIGNING_PRIVATE_KEY`. Release validates both secrets before tagging or
starting platform builds; secret values are never printed.

The Release workflow does not repeat frontend tests, Rust tests, linting, or an
isolated smoke binary. It builds the exact source SHA that already passed CI and
promotes those artifacts without rebuilding them.

## Modular CI

`ci.yml` classifies changed paths before calling reusable workflows:

- Frontend source and browser-independent tests run once on Linux.
- Rust and Tauri changes run Rust quality checks, Rust tests, and a complete
  desktop build on Linux, Windows, and macOS.
- Workflow changes select every module.
- Generated release metadata runs only its strict integrity check.
- Documentation-only changes skip expensive modules.

The always-present `CI / Required` job is the single branch-protection status.

## Local Commands

Dry runs can execute on any branch:

```bash
bun run release:beta:dry-run
bun run release:stable:dry-run
```

To prepare a Beta release commit locally, check out its persistent release line:

```bash
git switch release/0.29
bun run release:prepare:beta
```

To reproduce Stable preparation locally, create an ephemeral branch from the
current release-line head and name the selected Beta explicitly:

```bash
git switch -c prepare/v0.29.0 release/0.29
bun scripts/release.mjs --channel=stable --promote-beta=v0.29.0-beta.1
```

The script refuses to create release commits outside `release/*` or `prepare/*`
branches or when release-managed files already have uncommitted changes. It
never creates or pushes a tag; tagging belongs exclusively to the post-CI
Release workflow.
