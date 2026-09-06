# Local commands

Release automation changes must pass both `bun run lint:frontend` and
`bun run lint:actions`. These checks reject warnings as well as errors, including
unused JavaScript and shell variables in release scripts and workflow steps.
Dynamic values embedded in Bash parameter-expansion patterns must be quoted
separately so ShellCheck does not treat their contents as glob syntax.
On Windows, actionlint does not exercise its Linux ShellCheck integration, so
workflow Bash changes also require the repository's Linux actionlint container
check or the equivalent GitHub Actions job.

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
git restore --source master -- .github/workflows scripts \
  .agents/skills/openagent-release-engineering \
  tests/ciChanges.test.js tests/docsSync.test.js \
  tests/releaseCi.test.js tests/releaseVersion.test.js
git add .github/workflows scripts .agents/skills/openagent-release-engineering \
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
