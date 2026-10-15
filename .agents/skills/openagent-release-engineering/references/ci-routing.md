# Modular CI

The local SonarQube scan classifies `tests/`, `scripts/**/*.test.mjs`, the
TypeScript SDK test tree, and `runtime/rust/**/tests/**/*.rs` as tests. Keep those
paths out of production duplication measurements when changing
`sonar-project.properties`. Host and TypeScript SDK LCOV reports supply coverage;
Rust tests gate upload but do not currently produce a coverage report.
The SDK workspace test uses the persistent `runtime/target/sonar` directory so it
does not share Cargo build artifacts with an active desktop or SDK build. On
Windows it uses one Cargo job to avoid pagefile exhaustion while compiling the
large Runtime crate, which can otherwise surface as misleading missing-crate
errors.

`ci.yml` classifies changed paths before calling reusable workflows and applies
three verification routes:

- Pull requests from contributors without administrator permission and merge
  candidates run fast checks only for modules
  selected by the exact base-to-head path delta. Frontend checks stop after
  type, lint, format, and tests; native checks run host Rust quality and quick
  resource or contract validation without Windows/macOS matrices or embedding
  runtime execution.
- Administrator-authored PRs perform only a repository-permission check, then
  publish the successful aggregate without module checks or review. Ordinary
  pushes to `main` do not trigger CI.
- Release workflow calls, nightly schedules, and manual dispatches force every
  module through complete qualification: frontend production build and bundle
  budgets, Windows/macOS native compilation, and embedding runtime tests.
  Full runs never consume prior fast coverage. Frontend
  production assets and bootstrap build in `build-frontend.yml` concurrently with
  type/lint/test qualification. Formal releases provide that same-source build
  through the caller's mandatory tag gate instead of rebuilding it inside CI.
  Cache and run-scoped handoff invariants live in [artifacts](artifacts.md#parallel-release-construction-and-frontend-cache).
  Bundle budgets resolve both direct Vite manifest entries and source modules
  emitted through a manifest entry's dynamic imports, so code splitting does
  not fail a valid budget target before size measurement. The settings view
  budget is 208 KiB raw and 64 KiB gzip; the main route dependency graph is
  bounded to 1405 KiB raw and 448 KiB gzip, including theme selection, overrides
  and localized appearance controls (1404.7 KiB measured). Keep the raw limits explicit because
  this view is the largest settings surface and its gzip size can hide source
  growth.
  Run bundle measurement through `bun run check:bundle-size`, which uses Node's
  zlib on every platform. Bun's Windows gzip implementation can report a
  different compressed size for identical assets; it must not set the baseline.
- Workflow-router and shared dependency changes still conservatively select
  every affected module; the verification tier controls whether those modules
  use their quick or complete checks.
- The default-branch `workflow_run` reporter publishes `Required PR Head` for
  pull requests only. Native capability contexts can be reused for the exact
  tree. Automation and fast frontend coverage depend on the base-to-head delta
  and cannot be reused from tree-only statuses; administrator bypass runs have
  no capability coverage to reuse.
- The always-present aggregate proves that every selected check passed. Release
  qualification selects every check and gates tagging and builds directly.
- Creation of a Stable archive branch reports an all-zero GitHub `before` SHA;
  change detection falls back to the branch head's parent instead of treating
  the existing Beta snapshot as an entirely new repository.
- Documentation-only changes skip expensive modules. Shared test inventory
  includes OWT batch and Codex launcher contracts.
  Delivery helpers under `.agents/skills/deliver-via-owt/` follow the shared
  `.agents/skills/` automation route, including after skill directory renames.
  Whenever frontend checks are selected, local preflight builds fresh production
  assets and enforces bundle budgets after tests, including with `--all`.
  Bundle measurement and manifest-resolution changes select frontend checks
  as well as automation so their resulting assets are qualified.

## Affected JavaScript tests

Local preflight and both JavaScript CI modules call
`scripts/run-selected-tests.mjs`. Fast runs select changed tests and their
transitive import consumers from the current host source. The graph follows
relative imports, `$lib/`, re-exports, literal dynamic imports, index modules,
and Svelte script blocks. File-system, process, Bun file/glob access, and
computed-import tests remain shared guards because their complete input set
cannot be inferred from imports. These guards include helpers reached through
imports, so source-scanning contracts remain checked for every module run.
Literal repository-file reads establish component contract coverage; directory
scans stay shared guards and do not imply unit coverage for every new source.

The inventory discovers tracked and untracked host tests under `tests/` and
`scripts/`, and `sdk/typescript/tests/`, excluding ignored/generated output
and submodule test trees.
Frontend selection includes both frontend and automation tests; automation
uses every script and public SDK test plus the policy test names in `test-selection.mjs`.
New frontend tests are discovered without a registry edit. New policy tests
under `tests/` must join that automation name set and the module classifier.

Shared dependencies, public SDK source, Runtime gitlinks and plugin subscriptions, resources, workflow/selector changes,
an unavailable CI baseline, or changed paths without known dependency coverage
fall back to complete scope coverage. Deletions participate in classification
and selection. Never suppress an unmatched source path or treat zero selected
tests as success. Selected paths are passed as explicit Bun file arguments;
failure status propagates to the calling preflight or CI job.

CI passes an immutable base/head delta; local preflight passes its resolved base
and includes staged, unstaged, and untracked changes. Nightly, manual, and release
qualification set `TEST_FULL=true`; local `preflight --all` passes `--all`.
Complete frontend runs use `bun run test`, scoped to host tests, automation
scripts and the public SDK tests; private Runtime and plugin test trees are
qualified in their owning repositories. Type,
lint, format, build, bundle, native and desktop black-box gates retain their
existing ownership; affected test selection does not replace them.

Inspect a plan without running tests:

```bash
bun scripts/run-selected-tests.mjs --scope frontend --base main --dry-run
bun scripts/run-selected-tests.mjs --scope automation --all --dry-run
```

Plugin source subscriptions and `.gitmodules` changes select automation and
frontend checks. These jobs clone independent repositories from subscribed
branches; public SDK source needs no additional checkout, while private Runtime qualification keeps its separate token and fork route. Ordinary
plugin pushes do not select host CI. Host preflight does not compare source
versions with parent history; publication checks clean snapshots and immutable tags.

The pre-push source boundary checks every commit introduced by a push using
`.githooks/public-host-sources.txt`. Retain entries for retired public Tauri
resource adapters while their introduction remains in unpublished history.
`cua_driver_resource.rs` was a desktop-owned upstream binary downloader before
the Cua Driver plugin took over provisioning; its historical entry permits
publishing that existing native boundary. Current Cua provisioning remains
package-owned, and private Runtime sources require the SDK repository.
The withdrawn `replay_capture.rs` native journal adapter also remains on the
historical allowlist so unpublished commits that introduced it can be inspected;
it has no current module or invoke registration. This entry does not reactivate
recording.
Host source tests require every current adapter to appear in that allowlist;
historical entries authorized for unpublished commits may also remain.

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
