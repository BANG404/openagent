# OpenAgent contributor guide

OpenAgent is a Tauri 2 desktop app. SvelteKit owns presentation and interaction
state; the private `sdk` submodule owns the application runtime and typed
transports; `src-tauri` is the thin desktop host. The project is in active
debugging, so do not add compatibility paths unless the task explicitly
requires them.

## Read the relevant project guide first

- Treat implementation and agent-facing documentation as one change. Before
  editing, identify the behavior, invariant, ownership boundary, or workflow
  that the change affects and read its source-of-truth document. See
  `docs/agent-workflow.md` for the documentation map and completion checklist.
- For chat transcript UI, virtualization, streaming/final reconciliation,
  restore/bootstrap UI, attachment previews, or chat events, read the
  `openagent-chat-frontend` workspace skill.
- Before changing anything under `sdk/`, read `sdk/AGENTS.md` and every skill it
  requires for the affected SDK area. SDK implementation rules belong there,
  not in this public repository's guides.

## Commands

Use Bun for JavaScript dependencies and scripts. Prefix shell commands with
`rtk` as required by the global instructions.

```bash
bun run dev                 # Vite, port 14221
bun run build
bun run check               # Svelte + TypeScript
bun tauri dev
bun tauri build
cd src-tauri && cargo check
cd src-tauri && cargo build
```

Run the smallest relevant check first. Before handing off frontend or
cross-stack work, run `bun run check`; run `cargo check` for native changes
when practical.

Run `bun run check:docs` before handing off any logic change. The check requires
an agent-facing documentation update in the same change and applies stricter
source-of-truth rules to mapped areas such as the chat frontend.

## Public repository ownership

- `sdk/` is a pinned private Git submodule. Treat it as a separate repository:
  commit SDK changes there first, then commit only the resulting gitlink update
  here with any required host/frontend integration.
- `src-tauri/` is the host package boundary. It uses `openagent-app` only to
  apply OpenAgent product bootstrap and `openagent-runtime` for execution APIs.
  Keep Rust source there limited to thin binary entry points, Tauri
  Builder/command/event adapters, desktop capabilities, build configuration,
  and packaging metadata.
- `src/routes/+page.svelte` is the frontend composition root. Put new views in
  `src/lib/components/`; keep leaf components presentational.
- Put `invoke()` calls and cross-component state in feature containers or the
  page shell. Use Svelte 5 runes and one-way data flow.
- `src/lib/streamdown/` is the only extension point for streamed Markdown,
  code, Mermaid, ECharts, and AGUI rendering.
- Follow `docs/design.md` and prefer Bits UI primitives.

## Host and SDK integration

- Frontends submit ordinary chat and slash-command input through the shared SDK
  client; do not add flow selection or command parsing to the host/frontend.
- The frontend communicates with native code through typed Tauri calls and
  events. An IPC change must update the SDK contract/adapter and all public
  frontend types and call sites together.
- Keep SDK internals, architecture notes, diagnostic scripts, and runtime
  invariants in the private SDK repository. Public documentation should cover
  product behavior and the minimum clone/build/integration contract only.
- Inspector and trace data may contain model context. Never expose it in the
  normal product UI.

## Data and configuration

| Scope | Location |
| --- | --- |
| Config and SQLite | `OPENAGENT_HOME`, normally `~/.openagent/` on Linux or the platform user configuration directory |
| Global memory | `<OPENAGENT_HOME>/memory.md` |
| Global skills | `~/.agents/skills/<name>/SKILL.md` |
| Workspace state and skills | `<workspace>/.agents/` |
| Workspace design | `<workspace>/DESIGN.md` |

Never overwrite user-maintained memory sections. Change structured memory
through existing commands/tools. Skills require YAML frontmatter with `name`
and `description`; store category under `metadata`, while continuing to read
legacy top-level category values.

## Safe changes and verification

- When logic changes, update the relevant `AGENTS.md`, `docs/*.md`, README, or
  workspace `SKILL.md` in the same commit. Document the resulting behavior and
  durable constraints, not a chronological edit log. If the existing
  documentation remains correct, improve it with the newly confirmed invariant,
  boundary, failure mode, or verification procedure.
- Keep instructions close to their owner: repository-wide rules belong here;
  subsystem architecture belongs in `docs/`; repeatable agent procedures and
  fragile invariants belong in the triggering skill; SDK internals belong in
  the private SDK repository.
- During review, reject logic-only changes and stale instructions. Tests prove
  behavior; they do not replace agent-facing documentation.
- File/database-backed views need explicit loading state and layout-stable
  skeletons.
- Keep provider secrets out of source control.
- Treat the private submodule revision as release-relevant source input.
- For visible UI changes, verify light/dark themes and Chinese/English copy.
- Do not edit generated `build/`, `.svelte-kit/`, or `target/` output.


## Git workflow

Create a focused Conventional Commit for each independently usable, verified
unit:

```text
<type>(<scope>): <imperative summary>
```

Use `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, or `style`. Inspect
status and the intended diff, stage explicit paths only, and confirm the
resulting commit. Never use `git add .` or include unrelated changes.

For pull requests, summarize user-visible behavior, frontend/SDK impact,
configuration or dependency changes, and linked issues. Include screenshots or
recordings for UI changes.
