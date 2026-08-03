# OpenAgent contributor guide

OpenAgent is a Tauri 2 desktop app. SvelteKit owns presentation and interaction
state; the private `sdk` submodule owns the application runtime and typed
transports; `src-tauri` is the thin desktop host. The project is in active
debugging, so do not add compatibility paths unless the task explicitly
requires them.

## Read the relevant project guide first

- Treat implementation and agent-facing documentation as one change. Before
  editing, identify the behavior, invariant, ownership boundary, or workflow
  that the change affects and read its source of truth. The
  `deliver-via-pr` workspace skill owns the documentation map and handoff
  checklist as well as repository delivery.
- For chat transcript UI, virtualization, streaming/final reconciliation,
  restore/bootstrap UI, attachment previews, or chat events, read the
  `openagent-chat-frontend` workspace skill.
- Before changing anything under `sdk/`, read `sdk/AGENTS.md` and every skill it
  requires for the affected SDK area. SDK implementation rules belong there,
  not in this public repository's guides.
- For every task that changes repository files, read and follow the
  `deliver-via-pr` workspace skill before editing. It owns branch, worktree,
  pull request, CI, merge, and cleanup procedure.

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

GitHub pull-request CI is the authoritative delivery verification. For ordinary
implementation tasks, do not run local lint, test, check, or build commands
that duplicate CI. Before committing, inspect the complete diff and run
`git diff --check`. Tool-specific validation required to create an artifact,
interactive checks needed to implement a change, and checks explicitly
requested by the user are not duplicate delivery tests.

The `Required` pull-request check runs `check:docs` and aggregates every check
selected from the base-to-head file diff. Frontend and automation are top-level
modules; native verification is selected independently for Rust quality,
Windows/macOS compilation, bundled embedding behavior, and the Harness
contract. Changes to the CI router or result verifier force every capability,
as do dependency or private SDK changes for all of their consumers. Keep the
path classifier, its tests, reusable-workflow inputs, and both aggregate checks
aligned whenever a module boundary changes. Fix failures on the same task
branch and let CI rerun; do not merge a red or pending `Required` check.

Private SDK pull requests dispatch `sdk-ci.yml` on this public repository at an
immutable SDK commit. That workflow must keep private command output and build
artifacts out of public logs, artifacts, and target caches, and must report the
aggregate `Public SDK CI` commit status back through the least-privileged
reporter GitHub App. The private repository owns only the dispatcher workflow
and requires that reported status before merge.

## Browser-backed frontend workflow

Use the workspace `playwright` skill for every repository workflow that renders
or interacts with the frontend in a browser. Use its bundled wrapper, which
prefers an installed `playwright-cli`, then resolves it through Bun, with
Node/npm as an allowed fallback; do not substitute another browser control
surface. This includes, without limitation, verifying frontend changes,
reproducing browser-visible bugs, exercising preview routes and interactions,
checking responsive layouts, light/dark themes, and Chinese/English copy, and
capturing software screenshots, PDFs, videos, or traces.

Start the required development server, open the target through the skill,
snapshot before using element references, and re-snapshot after navigation or
material DOM changes. Prefer dedicated browser preview routes for state that
would otherwise require native Tauri setup. Keep automatic browser artifacts in
the system temporary directory through the skill wrapper. Do not create
repository-root output directories; copy only explicitly requested deliverables
to a deliberate tracked location.

## Public repository ownership

- `sdk/` is a pinned private Git submodule. Treat it as a separate repository:
  commit SDK changes there first, then commit only the resulting gitlink update
  here with any required host/frontend integration.
- `src-tauri/` is the host package boundary. It uses `openagent-app` only to
  apply OpenAgent product bootstrap and `openagent-runtime` for execution APIs.
  Keep Rust source there limited to thin binary entry points, Tauri
  Builder/command/event adapters, desktop capabilities, build configuration,
  and packaging metadata. The private SDK boundary check must validate backend
  sources under `sdk/rust/openagent-runtime/src` and require both SDK crates;
  keep that check aligned whenever crate ownership changes.
- `src/routes/+page.svelte` is the frontend composition root. Put new views in
  `src/lib/components/`; keep leaf components presentational.
- Put `invoke()` calls and cross-component state in feature containers or the
  page shell. Use Svelte 5 runes and one-way data flow.
- Render ordinary component children directly. Use an explicit Svelte
  `children` snippet only when the child contract requires snippet parameters.
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
| Config and SQLite | `OPENAGENT_HOME`, defaulting to `~/.openagent/` on every platform |
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

Repository-changing tasks use the complete `deliver-via-pr` workflow by
default. A request to implement or modify the repository authorizes creating an
isolated task branch and worktree, committing the intended changes, pushing the
task branch, opening a ready pull request, waiting for GitHub Actions, merging
after `Required` succeeds, and cleaning up the task worktree and branch. Stop
before an explicitly excluded stage when the user asks for local-only work,
uncommitted changes, no push, or no merge.
