# Modular CI

The local SonarQube scan classifies `tests/`, `scripts/**/*.test.mjs`, the
TypeScript SDK test tree, and `sdk/rust/**/tests/**/*.rs` as tests. Keep those
paths out of production duplication measurements when changing
`sonar-project.properties`. Host and TypeScript SDK LCOV reports supply coverage;
Rust tests gate upload but do not currently produce a coverage report.
The SDK workspace test uses the persistent `sdk/target/sonar` directory so it
does not share Cargo build artifacts with an active desktop or SDK build. On
Windows it uses one Cargo job to avoid pagefile exhaustion while compiling the
large Runtime crate, which can otherwise surface as misleading missing-crate
errors.

`ci.yml` classifies changed paths before calling reusable workflows and applies
two verification routes:

- Pull requests from contributors without administrator permission and merge
  candidates run fast checks only for modules
  selected by the exact base-to-head path delta. Frontend checks stop after
  type, lint, format, and tests; native checks run host Rust quality and quick
  resource or contract validation without Windows/macOS matrices or embedding
  runtime execution.
- Administrator-authored PRs perform only a repository-permission check, then
  publish the successful aggregate without module checks or review. Ordinary
  pushes to `master` do not trigger CI.
- Release workflow calls, nightly schedules, and manual dispatches force every
  module through complete qualification: frontend production build and bundle
  budgets, Windows/macOS native compilation, and embedding runtime tests.
  Full runs never consume prior fast coverage. Frontend
  bundle budgets resolve both direct Vite manifest entries and source modules
  emitted through a manifest entry's dynamic imports, so code splitting does
  not fail a valid budget target before size measurement. The settings view
  budget is 208 KiB raw and 64 KiB gzip; the main route dependency graph is
  bounded to 1401 KiB raw and 448 KiB gzip. Keep the raw limits explicit because
  this view is the largest settings surface and its gzip size can hide source
  growth.
  Run bundle measurement through `bun run check:bundle-size`, which uses Node's
  zlib on every platform. Bun's Windows gzip implementation can report a
  different compressed size for identical assets; it must not set the baseline.
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
- Documentation-only changes skip expensive modules. Local preflight's
  automation test selection includes OWT batch and Codex launcher contracts;
  keep this list aligned when removing or replacing delivery tooling.
  Whenever frontend checks are selected, local preflight builds fresh production
  assets and enforces bundle budgets after tests, including with `--all`.
  Bundle measurement and manifest-resolution changes select frontend checks
  as well as automation so their resulting assets are qualified.

Plugin gitlinks, `plugins/` source indexes, and `.gitmodules` changes select
automation and frontend checks, including Message Board integration coverage.
Frontend and automation jobs initialize only the pinned `plugins` submodules
before validation; private SDK checkout keeps its separate token and fork route.
Publish accepted package commits before advancing their parent gitlinks so clean
CI checkouts can retrieve the pinned revisions. Plugin source changes alone do
not select native or embedding checks.

The pre-push source boundary checks every commit introduced by a push using
`.githooks/public-host-sources.txt`. Retain entries for retired public Tauri
resource adapters while their introduction remains in unpublished history.
`cua_driver_resource.rs` was a desktop-owned upstream binary downloader before
the Cua Driver plugin took over provisioning; its historical entry permits
publishing that existing native boundary. Current Cua provisioning remains
package-owned, and private Runtime sources require the SDK repository.
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
