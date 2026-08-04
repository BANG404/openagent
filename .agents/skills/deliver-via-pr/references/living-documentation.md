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
- The selected delivery mode reached its terminal state: local mode has verified
  commits on the current remote-tracking default branch and no push; `OPR` has a
  ready PR whose remote-only task branch contains every unpublished local
  commit; `ORPR` has a passing `Required` check and a confirmed merge.
- Only `ORPR` requires remote-branch, task-worktree, and merged local-branch
  cleanup; local mode does not create a task branch, and `OPR` leaves the local
  default branch and upstream unchanged without touching unrelated work.
