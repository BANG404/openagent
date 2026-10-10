# Living documentation

Use this reference to choose where durable knowledge belongs before editing.
Treat code, tests, and agent-facing documentation as one deliverable, but keep
each behavior or invariant in one primary source of truth.

## Ownership map

| Change area | Primary documentation owner |
| --- | --- |
| Repository ownership, commands, safety, verification, or contribution policy | `AGENTS.md` |
| Product behavior, architecture, integration contract, configuration, release, or design system | The matching workspace skill and its focused references; update README only for public overview changes |
| Chat transcript, composer, tool rendering, streaming, reconciliation, restore, attachments, chat events, or streamed content | `.agents/skills/openagent-chat-frontend/` |
| Tauri host, native windows, single-instance behavior, IPC adapters, or native verification | `.agents/skills/openagent-desktop-host/`, plus `openagent-design-system` for visible behavior |
| Configuration, databases, memory, schemas, migrations, backups, or data-transition UX | `.agents/skills/openagent-configuration/` |
| CI classification, release workflows, Tauri bundles, sidecars, or pinned helper artifacts | `.agents/skills/openagent-release-engineering/` |
| A repeatable agent procedure or fragile subsystem invariant | The workspace skill that must trigger for future work |
| Repository-wide ownership, commands, safety, verification, or contribution policy | `AGENTS.md` |
| Private SDK implementation | Follow `sdk/AGENTS.md` and update SDK-owned documentation in the SDK commit before updating the parent gitlink |

Prefer an existing owner. Create a focused document, skill, or skill reference
only when no existing owner fits. Keep skill bodies concise: place the core
workflow in `SKILL.md`, deterministic execution in `scripts/`, detailed
knowledge in `references/`, and output resources in `assets/`.

Keep each `SKILL.md` as a compact router. Put substantial schemas, contracts,
examples, and conditional procedures in narrowly named references and link each
one from its entrypoint. Never place private SDK internals or model-context
diagnostics in this public repository.

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
- OWT reached its terminal state: verified commits from an isolated worktree
  are fast-forwarded into local `main`; task worktrees and fully merged
  branches are cleaned up, and nothing was pushed. The default directory stays
  on `main` for developer debugging. Private SDK delivery follows its owner.
- OWT bases each task on committed local default `HEAD`, preserves unrelated
  staged and working changes, and merges later committed default-branch
  descendants into the task branch. Rerun preflight after each integration and
  retry the fast-forward. The recorded local base remains authoritative
  regardless of remote divergence; never reconcile remote history or absorb
  unrelated working changes. Preserve ambiguous conflicts for direction.
- A batch coordinates the same OWT workflow using an explicit manifest for
  membership and one elected integrator for combined verification. It retains
  its completion record after safe cleanup. A blocked handoff remains pending
  integration while the default directory stays on `main`.
