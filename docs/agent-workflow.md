# Agent workflow and living documentation

OpenAgent treats code, tests, and agent-facing documentation as one deliverable.
An agent should be able to start from the current repository state and learn the
behavior that exists now without reconstructing it from commit history.

## Change loop

1. Inspect `git status` and read the nearest `AGENTS.md`.
2. Identify the behavior, invariant, ownership boundary, or operator workflow
   affected by the requested change.
3. Read the source of truth from the map below before editing.
4. Change implementation, focused tests, and the source-of-truth documentation
   together.
5. Describe the resulting state. Do not add a chronological note such as
   "updated X" or copy implementation details that are already obvious in code.
6. Run the smallest behavior check, then `bun run check:docs`. Run the broader
   checks required by `AGENTS.md` before handoff.
7. Inspect the complete diff and keep code plus its documentation in the same
   focused commit.

If a fix does not invalidate existing prose, add the knowledge learned while
debugging: the invariant that prevents recurrence, the relevant boundary, the
failure mode, or the verification scenario. Tests remain mandatory where
appropriate, but are not a substitute for documentation that agents must use.

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
- Relevant checks, including `bun run check:docs`, pass.
