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
description and a record in
`.agents/skills/manifest.json`. The manifest identifies the primary owner for
repository paths. A task may load secondary contracts for cross-boundary
behavior, but the primary owner decides where the durable invariant is edited.

When two owners appear applicable, use this order:

1. The manifest's primary owner for the changed path.
2. A referenced secondary contract for the cross-boundary behavior.
3. A verification skill only for the required observation or test procedure.

Do not resolve overlap by copying the same rule into multiple skills. Link to
the primary owner instead.

Skill discovery uses directory paths, visible counts, and names for global,
project, and enabled plugin skills. Models inspect candidate SKILL.md metadata
and instructions progressively. Categories are not required or generated.

Product-bundled skills are owned by public `crates/openagent-app/resources/skills`
and seeded by its product bootstrap into the global
skill directory, preserving existing user instructions. The fixed terminal
command conventions apply independently of skill discovery and role filtering;
the contextual terminal declaration identifies the workspace's default shell
and measured version. Utility setup remains task-driven skill guidance, not
unconditional binary installation or a replacement for file creation/editing
tools. Bundled skills retain ordinary
role association and discovery rules; host routing skills do not install them.

## Change and verification contract

Changes to runtime prompt composition update the SDK owner and its tests before
the parent gitlink is advanced. Changes to workspace routing or skill metadata
update the manifest or entrypoint and run `bun run check:skills`. Product logic
changes still require the relevant behavior documentation through
`bun run check:docs` and `bun run preflight`.

The chat documentation gate covers both the plain input-queue projection and
its Svelte state wrapper; changes to either require the chat owner's reference.

Prompt behavior should be verified with stable metadata or snapshots that show
which layers were selected, not by exposing raw system prompts, provider
secrets, or model-context diagnostics in normal product UI.

## Entrypoint size

Each skill `SKILL.md` is a compact router. Its prose body is limited to 200
non-whitespace characters; move detailed procedures, schemas, and examples to
linked references. `bun run check:skills` enforces this budget for every skill.
