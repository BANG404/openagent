# Agent workflow and living documentation

OpenAgent treats code, tests, and agent-facing documentation as one deliverable.
An agent should be able to start from the current repository state and learn the
behavior that exists now without reconstructing it from commit history.

## Change loop

1. Inspect the default worktree and fetch the latest `origin/master` without
   disturbing user changes.
2. Create a uniquely named `agent/*` branch and sibling worktree from
   `origin/master`. Reuse an existing task worktree only when it owns the same
   task.
3. Read the nearest `AGENTS.md`, the `deliver-via-pr` skill, and the source of
   truth from the map below before editing.
4. Change implementation and source-of-truth documentation together. Add or
   update focused tests when behavior needs coverage, but leave test execution
   to pull-request CI.
5. Inspect the complete diff, run `git diff --check`, stage explicit paths, and
   create focused Conventional Commits.
6. Push the task branch and open a ready pull request. GitHub Actions is the
   authoritative verifier; diagnose failures from the Actions logs, fix them on
   the same branch, and push again.
7. After `Required` succeeds, merge with the correct review policy, confirm the
   remote merge, then remove the registered clean task worktree and merged local
   branch.

If a fix does not invalidate existing prose, add the knowledge learned while
debugging: the invariant that prevents recurrence, the relevant boundary, the
failure mode, or the verification scenario. Tests remain mandatory where
appropriate, but are not a substitute for documentation that agents must use.

Do not run local lint, test, type-check, build, or documentation-sync commands
merely to duplicate the PR matrix. Local inspection and artifact-specific
validation may still be necessary to produce a correct change. If CI cannot run,
report that delivery is incomplete instead of substituting an unrecorded local
result and merging.

## Pull request policy

Every change to `master` must arrive through a pull request and pass the
non-bypassable `Required` status check. The repository owner may use the
review-only bypass on a PR authored under the owner account, but only after CI
succeeds. A third-party PR requires one owner approval and must be merged
without bypass. Because GitHub applies bypass permission to the person merging,
not the PR author, this distinction is an operator invariant rather than an
author-sensitive GitHub rule.

Two active repository rulesets keep those concerns separate:

- `master-ci` requires a pull request with zero approvals, requires the strict
  `Required` status check, and blocks deletion and non-fast-forward updates. It
  has no bypass actors.
- `master-review` requires one approval and gives only the `BANG404` user a
  pull-request-only bypass. That bypass never applies to `master-ci`.

The task worktree remains recoverable state while CI is running. Remove it only
after GitHub reports the PR as merged and the worktree is clean. Never force
cleanup, remove the default worktree, or delete an unmerged branch to make the
workflow appear complete.

## Source-of-truth map

| Change area | Documentation to update |
| --- | --- |
| Repository ownership, commands, safety, verification, or contribution workflow | `AGENTS.md` |
| Product behavior, architecture, integration contract, configuration, release, or design system | The matching file under `docs/`, plus a README when user setup or public behavior changes |
| Chat transcript, composer, tool rendering, streaming, reconciliation, restore, attachments, chat events, or streamed content | `.agents/skills/openagent-chat-frontend/SKILL.md`; update `docs/` too when the public architecture or product contract changes |
| A repeatable agent procedure or fragile subsystem invariant | The workspace skill that must trigger for future work; keep its description accurate and its body concise |
| Native host boundary or packaging | `AGENTS.md` or the matching `docs/` guide |
| Private SDK implementation | Follow `sdk/AGENTS.md` and update SDK-owned documentation in the SDK commit before updating the parent repository gitlink |

Prefer editing an existing source of truth. Create a new focused document or
skill only when no existing owner fits. Never place private SDK internals or
model-context diagnostics in this public repository.

## Automated policy

`bun run check:docs` examines the working tree locally and the base-to-head diff
in CI.

- Changes to product or automation logic require at least one agent-facing
  documentation change.
- Deleting logic is a behavior change and has the same documentation
  requirement as adding or editing it.
- Changes in the mapped chat frontend require the
  `openagent-chat-frontend` skill to change specifically.
- Test-only, generated-output, dependency-lock, and documentation-only changes
  do not create a documentation requirement.
- A private SDK gitlink change is validated by the SDK repository's own rules;
  the parent repository cannot reliably inspect documentation inside a pinned
  commit.

The checker is a minimum guardrail, not proof that the chosen document is
relevant or accurate. Reviewers must compare the behavior diff with the
documentation diff.

## Handoff checklist

- The code, tests, and documentation describe the same resulting behavior.
- Every changed invariant has one clear source of truth.
- `AGENTS.md` and skill instructions contain durable guidance, not task history.
- Skill metadata still describes the situations that should trigger it.
- Public documentation contains no private SDK implementation detail.
- The pull request's `Required` check passed and the PR is confirmed merged.
- The remote task branch, registered worktree, and merged local task branch were
  cleaned up without touching unrelated work.
