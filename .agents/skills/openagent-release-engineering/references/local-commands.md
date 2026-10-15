# Local development and release commands

Use Bun 1.3.14, matching `package.json` and CI, plus Node.js for scripts that
invoke `node`. Native builds use a current stable Rust toolchain and the
platform's Tauri dependencies. Complete source preparation requires access to
the pinned private SDK and the independent public plugin repositories.
Keep every workflow's Bun setup and the README prerequisites aligned with
`package.json`. Preflight checks the actual Bun version before launching any
checks and rejects mismatches with an upgrade instruction. Bun 1.3.14 is the
qualified Windows runner for the bounded Bash publication tests; older 1.2.x
runners can fail in `spawnSync` with an apparent allocation error.

## Prepare and run

In a fresh checkout or isolated task worktree:

```bash
bun run prepare:worktree:dev
bun run prepare:worktree:dev --native   # Only for a desktop/native scenario
bun run dev:desktop:source
```

Preparation initializes the pinned Runtime and independent plugin subscriptions,
installs the frozen Bun lockfile,
uses the checked-in public SDK client, and stages the checksummed portable
Node.js and terminal tools required by Tauri compile checks. Its submodule
preparation preserves LF bytes from the first checkout and repairs unchanged
legacy CRLF conversions;
see [independent plugin checkouts](../../openagent-plugin-development/references/local-development.md#independent-source-checkouts)
for configuration and edit-preservation boundaries. The default development command
does not compile Rust; `--native` additionally builds and stages the platform's
sandbox helpers and Runtime sidecar. Release preparation still builds both.
Ordinary desktop development supervises an external `openagent-server` and uses
`~/.openagent-dev`; select `OPENAGENT_HOME` only for a task-specific fixture.
Public development without SDK permissions uses `bun run dev:prepare` then
`bun run dev:desktop`; see [public development](public-development.md).
Use `bun run dev` for frontend-only work and `bun run tauri:dev:embedded` only
for an explicit embedded-Runtime diagnostic. See
[development Runtime refresh](development-runtime.md) for reload ordering and
build-directory ownership.

## Verify and build

During implementation, run exact affected cases before broad qualification:

```bash
bun scripts/verify-runtime.mjs --package openagent-runtime --case '<fully-qualified-unit-test>'
bun scripts/verify-runtime.mjs --package openagent-runtime --test '<integration-target>' --case '<exact-case>'
# Once focused behavior is stable, qualify that final source serially:
bun scripts/verify-runtime.mjs --package openagent-runtime --case '<fully-qualified-unit-test>' --qualify
```

The wrapper uses the same target triple, private dependency directory and
Windows non-incremental setting as Runtime preparation. It always creates a
temporary `OPENAGENT_HOME`, retains private logs there, rejects zero passed tests,
and stops before workspace tests when the focused case fails or source changes.
Do not start full workspace tests in parallel with focused tests. Complete the
SDK-owned remaining gates before an SDK push; this command does not replace
formatting, client, benchmark or real-model qualification. Source corrections
require a new focused pass before any broad checks. Final host preflight follows
the stabilized affected cases; do not run full preflight repeatedly as a debugger.

Runtime preparation and verification record the source worktree in the shared
Cargo target directory. Switching source directories invalidates only the five
SDK workspace packages under the build/staging lock; third-party dependencies
remain cached. This prevents Cargo's relative dependency timestamps from treating
a newer artifact compiled from another worktree as the current SDK interface.
An unknown existing cache receives the same one-time workspace invalidation.
The guard also checks local crate dep-info's source directory, so an already
running older launcher cannot silently overwrite that cache behind its marker.

`bun run test:model:cache` explicitly measures real-provider prompt cache hits
using the SDK-owned ignored test and dev model discovery. It consumes model
requests and is outside automatic preflight. The SDK's
`docs/runtime-model-tests.md` owns request budgets, selection, accounting and
failure semantics; do not implement provider requests or cache accounting in
the public host. Its output contains only usage and timing metadata.
Use `bun run test:model:cache --cache-matrix` for the explicit mutation matrix;
the SDK documentation owns its larger request budget and optional image,
concurrency and retention experiments.

For an owner-required ignored fixture test, add `--ignored` explicitly. This
selects only the exact case and retains the same nonzero-pass, isolated-data and
source-change gates. Fixture source paths must name exported copies, never an
installed application's database; the SDK test owns further temporary copies.

Inspect the complete diff, stage intended paths, and run `bun run preflight`.
It selects the applicable type, lint, format, test, build, and contract checks.
Native selections prepare and revalidate the shell's Node.js and terminal tools
before Clippy or Cargo, including a fresh or incompletely prepared worktree.
Do not manually duplicate them. Use `bun run preflight --dry-run` to inspect
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

The first command builds online shell installers and updater artifacts. The
second builds the offline overlay from a previously verified platform distribution
under `src-tauri/resources/bootstrap-release/`. Neither shell command compiles
private Runtime or sandbox helpers. Packaging and
release artifact requirements belong to [artifacts.md](artifacts.md).

## Release preparation

For reduced Windows-only previews, choose `alpha` in Prepare Release and follow
[Alpha releases](alpha-releases.md). It creates an isolated complete installer
without preparing a formal release commit or promoting a production release.

The GitHub **Prepare Release** workflow is the publication entrypoint. Local
reproduction happens in an isolated OWT worktree, with its default checkout
remaining on `main`. Fetch and explicitly select published promotion tags;
never copy a fixed historical version or silently select the newest tag.

Dry runs do not create release commits:

```bash
bun run release:beta:dry-run
bun run release:rc:dry-run
bun run release:stable:dry-run
```

For Beta reproduction, create a temporary `prepare/*` branch from the recorded
local `main` source inside that worktree, then run
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
