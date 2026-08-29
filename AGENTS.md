# OpenAgent contributor map

OpenAgent is a Tauri 2 desktop app. SvelteKit owns presentation and interaction
state, the private `sdk` submodule owns runtime behavior and typed transports,
and `src-tauri` is a thin desktop host. The project is in active debugging; do
not add compatibility paths unless the task explicitly requires them.

Keep this file at or below 150 lines. It is a routing map and repository
boundary, not a complete development manual. Put public product behavior and
architecture in `docs/`, repeatable procedures and fragile subsystem invariants
in workspace skills, and private SDK internals in the SDK repository.

## Route the task before editing

Read every applicable owner before changing files:

| Scope | Source of truth |
| --- | --- |
| Repository delivery, documentation ownership, commits, worktrees, PRs, CI handoff | `.agents/skills/deliver-via-pr/SKILL.md` |
| Chat transcript, composer, streaming/final reconciliation, restore, attachments, chat events, streamed rendering | `.agents/skills/openagent-chat-frontend/SKILL.md` |
| Tauri host, native windows, single instance, IPC adapters, desktop verification | `.agents/skills/openagent-desktop-host/SKILL.md` |
| Configuration, databases, memory, migrations, destructive data transitions | `.agents/skills/openagent-persistence/SKILL.md` |
| Workflows, releases, CI classification, helper packaging, bundle qualification | `.agents/skills/openagent-release-engineering/SKILL.md` |
| Browser-reproducible UI verification | `.agents/skills/playwright/SKILL.md` |
| Product design and component language | `docs/design.md` |
| Private SDK changes | `sdk/AGENTS.md` and every skill it requires |

Treat implementation and agent-facing documentation as one change. Identify
the affected behavior or invariant and its primary owner before editing; do not
duplicate the same detailed rule across this file, a skill, and `docs/`.

## Commands and verification

Use Bun for JavaScript dependencies and scripts. Prefix shell commands with
`rtk` as required by the global instructions.

```bash
bun run dev                              # Vite on an available port
bun run build
bun run check                            # Svelte + TypeScript
bun run preflight                        # Diff-selected fast checks
bun run prepare:windows-sandbox:dev      # Pinned Windows helpers
bun tauri dev                            # Tauri with the selected Vite URL
bun run tauri:build
cd src-tauri && cargo check
```

Before committing, inspect the complete diff, stage intended new files, and run
`bun run preflight`. It evaluates the branch, index, worktree, and untracked
filenames against `origin/master`. Use `--dry-run` to inspect its plan and
`--base <ref>` only when the target is not `master`.

Do not manually duplicate CI lint, test, check, or build commands. Artifact
validation, implementation-time interactive checks, and checks explicitly
requested by the user remain allowed. Do not edit generated `build/`,
`.svelte-kit/`, or `target/` output.

Debug Tauri runs use `~/.openagent-dev`. Set `OPENAGENT_HOME` only for a
task-specific fixture; routine development must not touch installed release
state under `~/.openagent`.

## Repository boundaries

- `sdk/` is a pinned private submodule. Commit and push SDK changes there first,
  then commit only its gitlink and required host/frontend integration here.
- `src-tauri/` contains thin entry points, Tauri plugins and commands, event
  adapters, desktop capabilities, build configuration, and packaging metadata.
  Runtime state machines and transport ownership stay in the SDK.
- `.githooks/public-host-sources.txt` explicitly lists public Rust host adapters.
  Add entries only for Tauri-owned native boundaries; SDK runtime behavior must
  remain behind the `sdk` gitlink. Unlisted host Rust modules block pushes.
- `src/routes/+page.svelte` is the frontend composition root. Put views in
  `src/lib/components/` and keep leaf components presentational.
- Keep Tailwind source detection rooted in `src/`; repository documentation and
  agent instructions must not become Vite dependencies or trigger page reloads.
- Put `invoke()` calls and cross-component state in feature containers or the
  page shell. Use Svelte 5 runes, one-way data flow, and direct ordinary
  children; use a `children` snippet only when parameters require it.
- Extend streamed Markdown, code, Mermaid, ECharts, or AGUI only through
  `src/lib/streamdown/`.
- Follow `docs/design.md` and prefer Bits UI primitives.

Frontends submit ordinary chat and slash-command input through the shared SDK
client; do not parse commands or select flows in a host. IPC changes update the
SDK contract or adapter, public frontend types, and all callers together.
Inspector and trace data may contain model context and must not appear in the
normal product UI.

## Data and user safety

The canonical locations and compatibility behavior live in
`docs/configuration.md`. At a glance:

| Scope | Location |
| --- | --- |
| Config and SQLite | `OPENAGENT_HOME`, default `~/.openagent/` |
| Global memory | `<OPENAGENT_HOME>/memory.md` |
| Global skills | `~/.agents/skills/<name>/SKILL.md` |
| Workspace state and skills | `<workspace>/.agents/` |
| Workspace design | `<workspace>/DESIGN.md` |

Never overwrite user-maintained memory sections or commit provider secrets.
Change structured memory through existing commands or tools. Skills require
YAML `name` and `description`; store category under `metadata` while continuing
to read legacy top-level category values.

Persisted configuration and conversation schemas are versioned compatibility
boundaries. Supported shapes require migration or normalization and failure
coverage. Ending support requires warning, a concrete backup opportunity,
version-boundary documentation, and destructive-path coverage in the same
change. File- or database-backed views need an explicit loading state and a
layout-stable skeleton.

## Change quality

- Update the relevant `AGENTS.md`, `docs/*.md`, README, or workspace skill when
  logic changes. Document the resulting behavior, ownership boundary, failure
  mode, or verification procedure—not the edit history.
- Tests prove behavior; they do not replace agent-facing documentation. Reject
  logic-only changes and stale instructions during review.
- Keep repository-wide rules here, public subsystem architecture in `docs/`,
  repeatable procedures in the triggering skill, and SDK internals in `sdk/`.
- Automation JavaScript is checked through the repository TypeScript config;
  add explicit JSDoc types where inference cannot establish safe boundaries.
- Treat the private submodule revision as release-relevant source input.
- Verify visible UI changes in light and dark themes and in Chinese and English.

## Delivery

Every repository-changing task uses `deliver-via-pr`. With no prefix, edit the
existing local `master`, run preflight, and create focused local commits without
branching or pushing. `OWT` selects an isolated local worktree that is later
fast-forwarded into local `master`; `OPR` publishes a ready PR and stops; `ORPR`
publishes, administrator-merges, and cleans up. The skill owns the exact
reconciliation, preservation, CI, and cleanup rules. Explicit user instructions
that alter a delivery stage take precedence.
