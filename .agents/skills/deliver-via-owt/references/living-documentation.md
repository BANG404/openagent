# Living documentation

Use this reference to choose where durable knowledge belongs before editing.
Treat code, tests, and agent-facing documentation as one deliverable, but keep
each behavior or invariant in one primary source of truth.

## Ownership

Use `.agents/skills/manifest.json` for the primary owner of repository paths and
AGENTS.md for intent routing. Skill-local references document the owned behavior;
README files describe the public overview. Private Runtime internals stay in its
repository and follow `runtime/AGENTS.md` before advancing the parent gitlink.
Repository-wide contribution policy belongs in AGENTS.md. Do not maintain another
copy of the path-to-owner map here.

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
- Update affected constraints and remove superseded guidance; avoid appending
  task history or unrelated detail merely to satisfy the documentation gate.
- Delete superseded guidance instead of leaving compatibility prose unless the
  task explicitly requires compatibility.
- Keep skill metadata accurate so the right work triggers the instructions.
- Keep detailed information in either a skill body or a reference, not both.
- Treat tests as behavior proof, not a substitute for agent-facing guidance.

`bun run check:docs` is the minimum automated guardrail. Product or automation
logic changes require Markdown under every affected primary owner selected by
the shared manifest. Public SDK code uses SDK documentation; unmapped repository
logic uses AGENTS.md, README or CHANGELOG. A change to an unrelated skill does
not satisfy this gate. Test-only, generated-output,
dependency-lock, and documentation-only changes do not create a documentation
requirement. The parent repository does not inspect documentation inside the
private SDK gitlink.

## Handoff checklist

- Code, tests, and documentation describe the same resulting behavior.
- Every changed invariant has one clear primary owner.
- `AGENTS.md` and skills contain durable guidance rather than task history.
- Skill metadata still describes the situations that should trigger it.
- Public documentation contains no private SDK implementation detail.
- Delivery used the [short Codex path](codex-worktree.md) for eligible
  conversation worktrees or [ordinary OWT](owt.md) when needed: verified
  commits are fast-forwarded into local `main`, task-created temporary resources
  are cleaned up, and reused worktrees stay with their manager. Report actual
  push status separately. The default directory stays on `main` for developer
  debugging. Private SDK delivery follows its owner.
- The delivery contract's recorded local base, explicit preflight baseline,
  preservation rules, and concurrent-integration checks were respected.
- A batch coordinates the same OWT workflow using an explicit manifest for
  membership and one elected integrator for combined verification. It retains
  its completion record after safe cleanup. A blocked handoff remains pending
  integration while the default directory stays on `main`.
