# OpenAgent contributor guide

OpenAgent is a Tauri 2 desktop app: SvelteKit owns presentation and interaction
state; Rust owns filesystem/process access, model calls, persistence, and MCP.
The project is in active debugging, so do not add compatibility paths unless the
task explicitly requires them.

## Read the relevant project skill first

Before changing these areas, load the matching workspace skill:

| Change area | Required skill |
| --- | --- |
| Chat streaming, checkpoints, compaction, interrupts, approvals, branches, provider projection, attachments, or runtime failures | `openagent-conversation-runtime` |
| Chat transcript UI, virtualization, streaming/final reconciliation, restore/bootstrap UI, attachment previews, or chat events | `openagent-chat-frontend` |
| `/goal`, `/graph`, Goal/Graph persistence, hidden continuation turns, graph reducers, or subagent events | `openagent-goal-graph` |
| Debugging conversation/checkpoint records | `inspect-conversation-checkpoints` |
| Driving or diagnosing the running debug app/API | `openagent-dev-chat` |

If a change crosses areas, read every applicable skill. Keep detailed,
area-specific invariants in those skills rather than growing this file.

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
cross-stack work, run `bun run check`; run `cargo check` for Rust changes when
practical.

## Architecture and ownership

- `sdk/` is the pinned private OpenAgent SDK submodule. Its
  `rust/openagent-runtime/` crate is the Tauri-independent contract boundary
  for slash commands, raw-input parsing, and agent/client routing. Keep it free
  of Tauri, providers, SQLite, and workspace dependencies. Every adapter must
  reuse it instead of parsing commands independently.
- `sdk/rust/openagent-app/` owns the complete private Rust backend: chat and
  flash agents, Rig integrations, configuration, prompt context, persistence,
  checkpoints, interrupts, tools, terminal sessions, MCP, skills, roles,
  Goal/Graph, compaction, tracing, and Tauri command adapters.
- `src-tauri/` is only the host package boundary. Keep its Rust source limited
  to thin binary entry points; its library target compiles directly from the
  private SDK submodule.
- `src/routes/+page.svelte` is the frontend composition root. Put new views in
  `src/lib/components/`; keep leaf components presentational.
- Put `invoke()` calls and cross-component state in feature containers or the
  page shell. Use Svelte 5 runes and one-way data flow.
- `src/lib/streamdown/` is the only extension point for streamed Markdown,
  code, Mermaid, ECharts, and AGUI rendering.
- Follow `docs/design.md` and prefer Bits UI primitives.

## Cross-cutting runtime rules

- `submit_agent_input` is the single routing entry point for ordinary chat and
  `/compact`, `/goal`, and `/graph`. Frontends and API adapters must not choose
  the flow themselves.
- The frontend communicates with Rust through typed Tauri `invoke()` calls and
  events. An IPC change must update the Rust command, `lib.rs` registration,
  and frontend types/call sites together.
- One application process owns one workspace window and `current_workspace`.
  Reuse/focus an existing workspace process; only the primary process owns
  scheduled hooks and the development inspector/API.
- Resolve workspace file paths through the existing safe resolver.
- Keep stable provider-prompt content first and byte-stable. Append volatile
  time, memory, workspace, and compaction context later.
- Inspector and trace data may contain model context. Never expose it in the
  normal product UI.

## Data and configuration

| Scope | Location |
| --- | --- |
| Config and SQLite | `~/.config/openagent/` |
| Global memory | `~/.config/openagent/memory.md` |
| Global skills | `~/.agents/skills/<name>/SKILL.md` |
| Workspace state and skills | `<workspace>/.agents/` |
| Workspace design | `<workspace>/DESIGN.md` |

Never overwrite user-maintained memory sections. Change structured memory
through existing commands/tools. Skills require YAML frontmatter with `name`
and `description`; store category under `metadata`, while continuing to read
legacy top-level category values.

## Safe changes and verification

- Use `tokio::fs` for async file I/O and `spawn_blocking` for synchronous
  SQLite or directory walks.
- File/database-backed views need explicit loading state and layout-stable
  skeletons.
- Keep provider secrets out of source control.
- Treat checkpoints, attachment blobs, and reverse diffs as user data; evolve
  formats carefully and test restoration/rollback.
- After any agent-runtime change, use `inspect-conversation-checkpoints` on the
  affected records. When a debug instance is available, run
  `renderability <conv-id>` through the dev API and report warnings/errors
  without exposing prompts or unrelated transcript content.
- For visible UI changes, verify light/dark themes and Chinese/English copy.
- Do not edit generated `build/`, `.svelte-kit/`, or `target/` output.
- Do not use the `control-in-app-browser` skill in this repository.

## Git workflow

Create a focused Conventional Commit for each independently usable, verified
unit:

```text
<type>(<scope>): <imperative summary>
```

Use `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, or `style`. Inspect
status and the intended diff, stage explicit paths only, and confirm the
resulting commit. Never use `git add .` or include unrelated changes.

For pull requests, summarize user-visible behavior, frontend/backend impact,
configuration or dependency changes, and linked issues. Include screenshots or
recordings for UI changes.
