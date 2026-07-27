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

Development commits land on `master`; ordinary pushes never create a version or
tag. Start the `Prepare Release` workflow manually from a `master` commit whose
`CI / Required` status passed, then choose `beta` or `stable`.

`scripts/release.mjs` inspects release-relevant commits since the latest
reachable `v*` tag and applies:

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
- From a beta tag, `stable` removes the beta suffix when there is no new
  release-worthy bump. If new release-worthy commits exist, it applies their
  bump to `X.Y.Z` and publishes that new stable version directly.
- From a stable tag, `stable` calculates the next `X.Y.Z` directly.

If legacy history contains both a stable tag and later beta tags with the same
`X.Y.Z`, the suffix cannot be removed safely. The script detects that collision
and recalculates from the existing stable tag instead of overwriting it.

## Release Pull Request

The preparation workflow first requires a successful CI run for the exact
`master` base SHA. It then creates a `release/vX.Y.Z...` branch and a single
`chore: release vX.Y.Z...` commit that changes only:

- `.github/release.json`
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `CHANGELOG.md`

If a retry finds the same `release/vX.Y.Z...` branch, it verifies that branch's
metadata, release channel, and verified-base parent before reusing it; it also
reuses an already-open release PR. Otherwise it generates and pushes the one
release commit. An existing immutable release tag stops preparation rather than
allowing the version to be reused. The workflow explicitly dispatches CI for the
release head SHA.
GitHub requires approval for a normal `pull_request` workflow created with
`GITHUB_TOKEN`, so the explicit dispatch provides the release check immediately.

Change detection recognizes this exact generated-file set as release metadata.
It reuses the successful base CI instead of rerunning frontend and Rust suites.
The automation check verifies that:

- all four runtime version fields match the requested tag;
- Beta/Stable updater endpoints match the selected channel;
- JSON manifests contain no unrelated edits;
- Cargo files change only the OpenAgent package version;
- the release commit contains every expected file and no unexpected file.

Review and merge the PR only after `CI / Required` passes.

## Publishing

Merging the Release PR creates a normal `master` push. CI validates that exact
merge SHA. After the successful `CI` workflow completes, `release.yml` checks
that the release marker changed and is ready, repeats the metadata integrity
validation, and creates an annotated tag pointing to that same SHA.

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

To prepare a release commit locally, create a release branch first:

```bash
git switch -c release/manual
bun run release:prepare:beta
# or: bun run release:prepare:stable
```

The script refuses to create release commits outside `release/*` branches or
when release-managed files already have uncommitted changes. It never creates or
pushes a tag; tagging belongs exclusively to the post-CI Release workflow.
