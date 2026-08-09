# Living documentation

Use this reference to choose where durable knowledge belongs before editing.
Treat code, tests, and agent-facing documentation as one deliverable, but keep
each behavior or invariant in one primary source of truth.

## Ownership map

| Change area | Primary documentation owner |
| --- | --- |
| Repository ownership, commands, safety, verification, or contribution policy | `AGENTS.md` |
| Product behavior, architecture, integration contract, configuration, release, or design system | The matching file under `docs/`, plus a README when public setup or behavior changes |
| Chat transcript, composer, tool rendering, streaming, reconciliation, restore, attachments, chat events, or streamed content | `.agents/skills/openagent-chat-frontend/`; update `docs/` only when the public product or architecture contract also changes |
| A repeatable agent procedure or fragile subsystem invariant | The workspace skill that must trigger for future work |
| Native host boundary or packaging | `AGENTS.md` or the matching `docs/` guide |
| Private SDK implementation | Follow `sdk/AGENTS.md` and update SDK-owned documentation in the SDK commit before updating the parent gitlink |

Prefer an existing owner. Create a focused document, skill, or skill reference
only when no existing owner fits. Keep skill bodies concise: place the core
workflow in `SKILL.md`, deterministic execution in `scripts/`, detailed
knowledge in `references/`, and output resources in `assets/`.

Do not move public product documentation into a skill merely to reduce the
`docs/` directory. Skills are agent procedures and operational context; public
behavior and architecture must remain discoverable without triggering a skill.
Never place private SDK internals or model-context diagnostics in this public
repository.

## Documentation policy

- Document the resulting behavior and durable constraint, not task history.
- If existing prose remains correct, add the newly confirmed invariant,
  ownership boundary, failure mode, or verification scenario.
- Delete superseded guidance instead of leaving compatibility prose unless the
  task explicitly requires compatibility.
- Keep skill metadata accurate so the right work triggers the instructions.
- Keep detailed information in either a skill body or a reference, not both.
- Treat tests as behavior proof, not a substitute for agent-facing guidance.

`bun run check:docs` is the minimum automated guardrail. Product or automation
logic changes require an agent-facing Markdown change. Mapped chat frontend
logic requires a Markdown change somewhere under
`.agents/skills/openagent-chat-frontend/`. Test-only, generated-output,
dependency-lock, and documentation-only changes do not create a documentation
requirement. The parent repository does not inspect documentation inside the
private SDK gitlink.

## Handoff checklist

- Code, tests, and documentation describe the same resulting behavior.
- Every changed invariant has one clear primary owner.
- `AGENTS.md` and skills contain durable guidance rather than task history.
- Skill metadata still describes the situations that should trigger it.
- Public documentation contains no private SDK implementation detail.
- The selected delivery mode reached its terminal state: direct local mode
  created verified commits on the local default branch without creating a task
  branch or worktree and did not push; `OWT` created verified commits in an
  isolated worktree, fast-forwarded them into the local default branch, cleaned
  up its task worktree and branch, and did not push; private SDK commits were
  pushed directly to `main`; `OPR` has a ready PR on a preserved task branch
  while the default worktree equals its remote; `ORPR` has an
  administrator-bypassed confirmed merge.
- `OPR` retains its dedicated task branch or worktree for later review follow-up
  and stops before cleanup. Its reconciler may rewrite only a verified linear
  unpublished tail onto the remote default after preserving the original head,
  and may align the default branch only after the remote branch and ready PR
  match exactly. Direct local mode commits only intended paths or clearly owned
  hunks and preserves unrelated staged and working changes, including separable
  changes in the same file, in place. `OWT` bases its temporary task
  branch on the committed local default `HEAD`, merges later committed
  default-branch descendants into the task branch, reruns preflight after every
  such integration, and retries until the default branch can fast-forward. Its
  recorded local default `HEAD` remains authoritative regardless of remote
  divergence; it never reconciles remote history, absorbs unrelated working
  changes, or continues through real conflicts or non-linear local ancestry.
  `ORPR` completes remote-branch, task-worktree, and merged local-branch cleanup.
