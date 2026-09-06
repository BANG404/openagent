# Modular CI

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
  Harness integration. Full runs never consume prior fast coverage. Frontend
  bundle budgets resolve both direct Vite manifest entries and source modules
  emitted through a manifest entry's dynamic imports, so code splitting does
  not fail a valid budget target before size measurement.
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
