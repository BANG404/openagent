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

Every workspace skill has a directory-matching `name`, a non-empty description
and one record in `.agents/skills/manifest.json` (schema version 2). Every skill
implicitly owns its own directory. Workflow-only skills may have an empty paths
array. The manifest is the canonical file-ownership map; AGENTS.md routes by
intent and verification skills supply observation procedures.

Paths are exact files, directory prefixes ending in `/`, or patterns with `*`
matching within one path segment. Select the match with the longest literal
prefix (before the first `*`); an exact file wins over a directory prefix of the
same length. Equal-specificity matches from different owners are errors, never
resolved by manifest order. `scripts/agent-skill-routing.mjs` implements this
contract for both skill validation and the documentation gate.

Load secondary contracts only for affected cross-boundary behavior. Edit each
durable invariant at its primary owner and link to it from other skills. Every
reference must be reachable through Markdown links from its own SKILL.md; entry
routing should say when to read it, rather than requiring a directory-wide read.
Independent plugin specifications use canonical repository URLs so validating
workspace documentation does not require cloning optional plugin sources.

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

The documentation gate resolves each changed logic file through this same
manifest and requires Markdown under every affected primary owner. Public SDK
changes require SDK documentation; unmapped repository-level logic requires
AGENTS.md, README or CHANGELOG. Unrelated documentation cannot satisfy an owner's
contract. Tests, generated output and the private Runtime gitlink retain their
existing separate verification routes.
Prepare Release's metadata-only change set uses its release marker and CHANGELOG
as the documentation route. Adding product or automation logic requires the
ordinary owner documentation even when release metadata is present.

Prompt behavior should be verified with stable metadata or snapshots that show
which layers were selected, not by exposing raw system prompts, provider
secrets, or model-context diagnostics in normal product UI.

## Entrypoint size and validation

Keep SKILL.md focused on essential constraints and task-to-reference routing.
The recommended body budget is 6000 non-whitespace characters, including examples
and link destinations; exceeding it prints a review hint rather than failing.
A short skill can be self-contained. Conditional detail belongs in references.

`bun run check:skills` enforces metadata, relative-link existence, reference
reachability and unambiguous ownership on repository files. It rejects duplicate
routes and stale directory/pattern prefixes. Exact context files such as DESIGN.md
may be prospective; ignored independent plugin checkouts are not inventory inputs.
Length is a soft signal; reachable, specific routing is the required contract.
