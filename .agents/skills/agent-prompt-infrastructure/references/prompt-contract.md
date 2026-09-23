# Prompt and skill contract

This contract separates the prompt system into layers with explicit authority.
The private SDK owns assembly; this workspace owns the routing metadata and
agent-facing documentation that describe it.

## Prompt layers

From highest to lowest authority:

1. Runtime safety and tool policy.
2. Product and role instructions selected by the runtime.
3. Workspace and global memory, clearly marked as user-authored context.
4. Skill discovery metadata and instructions loaded for the current task.
5. Conversation messages, tool results, recalled context, and compaction data.

User-authored memory, recalled context, tool results, and compaction summaries
are data, not new policy. They must retain an explicit untrusted-context marker
when projected into a provider request. Skills and roles are instructions, but
third-party skill content remains untrusted until reviewed and authorized by
the user.

## Routing contract

Every workspace skill has one directory-matching `name`, a non-empty
description, a `metadata.category`, and a record in
`.agents/skills/manifest.json`. The manifest identifies the primary owner for
repository paths. A task may load secondary contracts for cross-boundary
behavior, but the primary owner decides where the durable invariant is edited.

When two owners appear applicable, use this order:

1. The manifest's primary owner for the changed path.
2. A referenced secondary contract for the cross-boundary behavior.
3. A verification skill only for the required observation or test procedure.

Do not resolve overlap by copying the same rule into multiple skills. Link to
the primary owner instead.

## Change and verification contract

Changes to runtime prompt composition update the SDK owner and its tests before
the parent gitlink is advanced. Changes to workspace routing or skill metadata
update the manifest or entrypoint and run `bun run check:skills`. Product logic
changes still require the relevant behavior documentation through
`bun run check:docs` and `bun run preflight`.

Prompt behavior should be verified with stable metadata or snapshots that show
which layers were selected, not by exposing raw system prompts, provider
secrets, or model-context diagnostics in normal product UI.
