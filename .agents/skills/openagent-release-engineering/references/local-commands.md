# Local development and release commands

Use Bun 1.2.21, matching `package.json` and CI, plus Node.js for scripts that
invoke `node`. Native builds use a current stable Rust toolchain and the
platform's Tauri dependencies. Complete source preparation requires access to
the pinned private SDK and the public plugin submodules.

## Prepare and run

In a fresh checkout or isolated task worktree:

```bash
bun run prepare:worktree:dev
bun tauri dev
```

Preparation initializes pinned submodules, installs the frozen Bun lockfile,
and builds the platform's development sandbox helpers and Runtime sidecar.
Ordinary desktop development supervises an external `openagent-server` and uses
`~/.openagent-dev`; select `OPENAGENT_HOME` only for a task-specific fixture.
Use `bun run dev` for frontend-only work and `bun run tauri:dev:embedded` only
for an explicit embedded-Runtime diagnostic. See
[development Runtime refresh](development-runtime.md) for reload ordering and
build-directory ownership.

## Verify and build

Inspect the complete diff, stage intended paths, and run `bun run preflight`.
It selects the applicable type, lint, format, test, build, and contract checks;
do not manually duplicate them. Use `bun run preflight --dry-run` to inspect
the plan. Visible desktop changes additionally run their owning native black-box
scenario. Follow [OWT delivery](../../deliver-via-owt/references/owt.md) for
worktree integration and cleanup.

Release automation preflight includes `lint:frontend` and `lint:actions`, both
of which reject warnings. Quote dynamic values in Bash expansion patterns and
keep ShellCheck directives parser-compatible. Windows actionlint does not run
Linux ShellCheck; workflow Bash changes also need the repository's Linux
actionlint container check or the equivalent GitHub Actions job.

```bash
bun run tauri:build
bun run tauri:build:full
```

The first command builds lightweight installers and updater artifacts. The
second builds the first-install overlay with the embedding seed. Packaging and
release artifact requirements belong to [artifacts.md](artifacts.md).

## Release preparation

The GitHub **Prepare Release** workflow is the publication entrypoint. Local
reproduction happens in an isolated OWT worktree, with its default checkout
remaining on `master`. Fetch and explicitly select published promotion tags;
never copy a fixed historical version or silently select the newest tag.

Dry runs do not create release commits:

```bash
bun run release:beta:dry-run
bun run release:rc:dry-run
bun run release:stable:dry-run
```

For Beta reproduction, create a temporary `prepare/*` branch from the recorded
local `master` source inside that worktree, then run
`bun run release:prepare:beta`. For RC, start at the selected published Beta
and use `bun scripts/release.mjs --channel=rc --promote-beta=<published-beta-tag>`.
For Stable, start at the selected published RC and use
`bun scripts/release.mjs --channel=stable --promote-rc=<published-rc-tag>`.
The angle-bracket values are explicit inputs, not literal shell arguments.

Promotions refresh only the automation paths allowed by
`.github/workflows/prepare-release.yml` before generating metadata. Preserve the
selected source's product tree; see [release sources](release-sources.md) and
[versioning](versioning.md) for the authoritative constraints.

The script refuses release commits outside `release/*` or `prepare/*`, or when
release-managed files have uncommitted changes. It never creates or pushes a
tag. Tagging and publishing belong exclusively to the qualified Release
workflow; local reproduction is not authorization to publish.
