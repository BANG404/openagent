# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend only
bun run dev          # SvelteKit dev server (port 14221)
bun run build        # Build frontend to /build
bun run check        # svelte-check type checking

# Full Tauri app (frontend + Rust backend together)
bun tauri dev        # Launch Tauri desktop app in dev mode
bun tauri build      # Bundle distributable app

# Rust only (from src-tauri/)
cargo check          # Type-check without building
cargo build          # Build Rust backend
```

Use `bun` as the package manager (not npm/yarn).

```bash
# Convenience target — creates Todo/<NN>_<title>.md
make ntd <title>     # e.g. make ntd embed-send-button-in-input
```

## Architecture

The app is split into two OS processes:

**Tauri Core (`src-tauri/`)** — Rust backend managing all I/O and LLM calls:
- `lib.rs` — Tauri app setup, plugin registration, `ConversationMemory` initialization
- `commands.rs` — All `#[tauri::command]` handlers; the Chat Agent and Memory Agent are constructed and invoked here using macros (`build_chat_agent!`, `build_memory_agent!`, `stream_chat_agent_tracked!`)
- `state.rs` — `AppState` struct: shared Tokio mutexes for config, conversation histories (keyed by `conv_id`), workspace path, cancel flags, memory sync state, MCP tool server handle, MCP join handles, and per-request interrupt channels
- `config.rs` — TOML config at `~/.config/openagent/config.toml`; memory file at `~/.config/openagent/memory.md`; includes `McpServerConfig` and `WebSearchConfig` (provider: `Brave` | `Tavily` | `Searxng`)
- `context.rs` — Assembles the system prompt by reading global memory, vector-retrieved cross-session history, local workspace memory (`.agents/memory.md`), Git branch, and loaded Skills
- `conversation_memory.rs` — SQLite (rusqlite) + fastembed (AllMiniLML6V2, 384-dim) for hybrid retrieval of past messages and `AgentMemoryEntry` records; combines vector cosine similarity (weight 0.5), FTS5 keyword search / Dice coefficient (0.3), and exponential time decay (0.2)
- `checkpoint.rs` — Checkpoint data types: `ConversationMeta`, `ChatMessageRecord`, `CheckpointMeta`, `FileChange`, `CheckpointData`, and serialization helpers (`to_serializable`, `messages_from_checkpoint`) for converting between rig `Message` and SQLite-persisted forms
- `tools.rs` — Core tools: `read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep`, `websearch`, `fetch`, `ask_user` (Chat Agent), plus `save_agent_memory` (Memory Agent only). File-touching tools resolve paths through `resolve_workspace_path` and reject anything that escapes the active workspace root. `ask_user` blocks on a oneshot channel registered in `AppState.interrupt_channels`; the frontend renders a form from the event payload and resolves it via `submit_interrupt_response`. Conv id is propagated via `tools::ACTIVE_CONV_ID` (a `tokio::task_local` scoped by `send_chat_message`).
- `terminal.rs` — Terminal tools: `terminal_exec` (foreground, blocks for output, 30s default / 300s max timeout, 200KB output cap), plus a background-session family — `terminal_start` returns a `session_id`; `terminal_read` (with optional `from_byte` cursor) / `terminal_write` / `terminal_kill` / `terminal_list` operate on that id. Sessions are stored in `AppState.terminal_sessions` (a `HashMap<session_id, Arc<TerminalSession>>`); each session holds a 256KB ring-trimmed output buffer plus the `tokio::process::Child` (spawned with `kill_on_drop`). Max 20 concurrently-running background sessions. `cwd` resolves through `resolve_workspace_path` so the agent cannot escape the workspace. Default shell: PowerShell (pwsh→powershell) on Windows, bash on *nix; the agent can override via `shell: "powershell" | "cmd" | "bash" | "sh"`.
- `skills.rs` — Discovers Skills from `~/.agents/skills/` (global) and `<workspace>/.agents/skills/` (local); each skill lives in its own subdirectory with a `SKILL.md` file containing YAML frontmatter (`name`, `description`)
- `mcp.rs` — Builds the base `ToolServerHandle` and connects external MCP servers; supports HTTP (`StreamableHttpClientTransport`) and stdio (`TokioChildProcess`) transports; tools are injected into the agent at call time
- `tracing_setup.rs` — Langfuse observability via OpenTelemetry; reads `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST`/`LANGFUSE_BASE_URL` from a `.env` file; falls back to `tracing_subscriber::fmt` if keys are absent

**Webview (`src/`)** — SvelteKit SPA (SSR disabled via `+layout.ts`). `routes/+page.svelte` is the shell that composes the feature components in `lib/components/` (chat: `MessageList`, `MessageInput`, `ToolCallCard`, `MentionPalette`, `FileChangeBanner`; navigation: `SidebarNav`, `ConversationList`, `WorkspaceSwitcher`; modals: `SettingsView`, `MemoryView`, `SkillsView`; chrome: `WindowControls`). Cross-cutting modules live directly in `lib/`:
- `lib/chatStream.ts` — Subscribes to `chat-chunk`/`chat-tool-call`/`chat-tool-result`/`chat-done` events and attaches them to the active turn
- `lib/checkpointTree.ts` — Builds the branching checkpoint tree from `ChatMessageRecord`s and exposes `attachNewTurn`
- `lib/conversationDb.ts` — Thin wrapper over the SQLite-backed conversation IPC commands
- `lib/streamdown/` — Custom token renderer used by `MessageList` for markdown, code, Mermaid diagrams, and ECharts (do NOT bolt rendering logic into individual message components — extend the renderer here)
- `lib/mermaidTheme.ts` — Theme tokens used by the Mermaid renderer
- `lib/types.ts` — Shared TypeScript interfaces (`ChatMessage`, `Conversation`, `AppConfig`, `WorkspaceContext`, `FileChange`, `CheckpointMeta`, etc.)
- `lib/config.ts` — `normalizeConfigShape()` utility that migrates legacy `chat_agent`/`memory_agent` config fields to the canonical `providers[]` + `defaults` structure
- `lib/i18n.ts` — Svelte store-based i18n; supports `zh` (default) and `en`; locale is persisted via `tauri-plugin-i18n`

### Two-agent design

| Agent | Model (default) | Role |
|---|---|---|
| Chat Agent | `claude-sonnet-4-6` | Responds to the user, uses all file tools + web tools, streams via `chat-chunk`/`chat-done` Tauri events, up to 10 multi-turn steps |
| Memory Agent | `claude-haiku-4-5` | Runs asynchronously after each response; writes `AgentMemoryEntry` records via `save_agent_memory` |

Memory Agent uses a `RwLock` + `AtomicBool` to prevent concurrent memory writes. It runs at most once at a time; duplicate triggers are silently dropped.

### Skills system

Skills are reusable instruction documents injected into the agent's system prompt. Each skill lives at:
- **Global**: `~/.agents/skills/<dir>/SKILL.md`
- **Local**: `<workspace>/.agents/skills/<dir>/SKILL.md`

The `SKILL.md` requires YAML frontmatter with `name` and `description` fields. At prompt build time, all available skills are listed (name + description + path); the agent uses `read_file` to load the full content of a skill when needed.

### Checkpoint and file-change tracking

Each `send_chat_message` call creates a checkpoint in SQLite linking:
- A unified structured message stream (`CheckpointData.messages`) containing role/content, display metadata, and semantic tags
- File changes made during that turn (`FileChange` records with reverse diffs and zstd-compressed fallback content)

`rollback_to_checkpoint` restores the agent's in-memory history from a checkpoint. `revert_file_change` applies the stored reverse diff (or fallback content) to restore individual files on disk. The `FileChangeBanner` component surfaces these per-turn in the chat panel.

### MCP integration

External MCP servers are configured in `config.mcp.servers[]` (stored in `config.toml`). At startup and on every `save_mcp_servers` call, `mcp::connect_mcp_servers` spawns background tasks that connect each enabled server and register its tools into the shared `ToolServerHandle`. The `build_base_tool_server` function always includes the built-in tools; MCP tools are appended on top.

### Memory file format

Memory files have two zones — the Memory Agent must never modify the user-written zone:

```markdown
## [User-maintained] Personal habits
<!-- User edits freely here; agent never touches this section -->

## [Agent-maintained] Recent context summary
<!-- Memory Agent only operates below this comment -->
```

- **Global memory**: `~/.config/openagent/memory.md` — injected into every system prompt
- **Local memory**: `<workspace>/.agents/memory.md` — injected when a workspace is set

### LLM providers

Config has two layers:
1. **`providers[]`** — Named provider entries (id, name, provider type, api_key, base_url, enabled, models cache). Managed from the Providers settings page.
2. **`defaults.chat_model` / `defaults.flash_model`** — Default model bindings (provider_id + model) selected from the configured providers.

The provider/defaults structure is the only supported configuration format.

### Tauri IPC

**Commands (invoke → Rust):**

| Command | Purpose |
|---|---|
| `send_chat_message` | Send a message with optional `prior_messages` to re-hydrate history; emits `chat-chunk`, `chat-tool-call`, `chat-tool-result`, `chat-done`; creates checkpoint + file-change records |
| `cancel_chat_message` | Set the cancel flag for a conv_id to abort a running stream |
| `get_settings` / `save_settings` | Read/write `config.toml` |
| `test_provider_connection` | Probe a provider with a minimal request |
| `fetch_provider_models` | Retrieve the model list from a provider's API |
| `set_workspace` / `get_workspace_context` | Set workspace path; returns path + git branch + `.agents/` existence |
| `get_conversations` | List `ConversationMeta` rows from SQLite (filtered by workspace) |
| `create_conversation` / `update_conversation` / `delete_conversation` | CRUD for conversation metadata in SQLite |
| `get_chat_messages` / `save_chat_message` | Read/write `ChatMessageRecord` rows in SQLite |
| `get_latest_checkpoint` | Return the most recent `CheckpointMeta` for a conversation |
| `rollback_to_checkpoint` | Restore agent history buffer from a stored checkpoint |
| `get_file_changes` | Return all `FileChange` records for a conversation |
| `revert_file_change` | Apply reverse diff (or zstd fallback) to restore a file; deletes the record |
| `clear_conversation` | Remove in-memory history and session ID for a conv_id |
| `trigger_memory_agent` | Manually kick off Memory Agent |
| `get_memory_status` | Poll whether Memory Agent is running (bool) |
| `get_memory` / `save_memory` | Read/write memory files by scope (`"global"` or `"local"`) |
| `get_agent_memories` | Query `AgentMemoryEntry` records from SQLite (supports FTS5 keyword search) |
| `delete_agent_memory` | Delete a specific `AgentMemoryEntry` by id |
| `list_skills` / `get_skill_content` / `save_skill_content` | Discover skills and read/write `SKILL.md` content |
| `create_skill` / `delete_skill` / `get_skills_dir` | Manage skill directories in global or local scope |
| `get_mcp_servers` / `save_mcp_servers` | Read/write MCP server config; `save_mcp_servers` reconnects all servers |
| `test_mcp_server` / `refresh_mcp_servers` | Probe a single server or reconnect all enabled servers |
| `open_path` | Open a file or directory with the OS default application |
| `get_system_locale` | Return the OS locale string |

**Events (Rust → frontend):**

| Event | Payload |
|---|---|
| `chat-chunk` | `{ conv_id, text }` — incremental text token |
| `chat-tool-call` | `{ conv_id, name, args }` — tool invocation |
| `chat-tool-result` | `{ conv_id, result }` — tool response |
| `chat-done` | `{ conv_id, text, error? }` — stream finished |

### Frontend state

Conversation metadata and chat messages are now persisted in SQLite via `ConversationMemory` (commands: `get_conversations`, `create_conversation`, `get_chat_messages`, `save_chat_message`). The legacy `localStorage` keys (`openagent_conversations`, `openagent_workspace`, `openagent_active_conv`) may still be used for session-local UI state. The Rust side holds the authoritative `Vec<Message>` for each active conversation keyed by `conv_id`; on first message for a conv_id, `send_chat_message` accepts `prior_messages` to re-hydrate that buffer.

## UI / Design

**Reference: `docs/design.md`** — a full Apple-style design spec. All frontend components must follow it.

### Frontend Architecture Principles

- **Componentization**: Pages are assembled from reusable components. Shared UI elements live in `src/lib/components/` and are imported wherever needed — never duplicated inline.
- **Container/Presentation pattern**: Keep business logic (data fetching, state mutations, Tauri `invoke` calls) in container components or the page-level script; pure UI components receive data via props and emit events upward.
- **Unidirectional data flow**: Data flows down through props; user actions propagate up through callback props (e.g. `onSave`, `onClose`). Svelte 5 runes (`$state`, `$derived`) follow this discipline — avoid direct mutation of parent state from child components.
- **Modular monolith**: The app remains a single Tauri process, but is layered clearly by domain and responsibility: Rust backend (`src-tauri/`) owns all I/O; SvelteKit frontend (`src/`) owns all UI; `src/lib/` holds shared types, utilities, and components.

## Git Workflow

After completing each task (or logical sub-task), create a commit immediately — don't batch unrelated changes.

### Commit message format

```
<type>(<scope>): <imperative summary>
```

- **type** — `feat` · `fix` · `refactor` · `chore` · `docs` · `test` · `perf` · `style`
- **scope** — the affected module, file, or domain (e.g. `toast`, `mcp`, `commands`, `streamdown`, `ui`, `config`)
- **summary** — present-tense, ≤ 72 chars, no trailing period

### Granularity rules

| What changed | One commit or many? |
|---|---|
| Single new component | One commit |
| New component + its Tauri command | One commit (they ship together) |
| Two unrelated bug fixes | Two commits |
| Refactor + new feature | Two commits |
| Docs / todo update | Separate commit, type `docs` |

### Examples from this repo

```
feat(toast): add Toast notification system
fix(mermaid): update svelte-streamdown patch for crisp SVG zoom
refactor(UserInputForm): replace scoped style block with Tailwind utilities
chore(ui): integrate Toast and download hook into app shell
docs(todo): expand #52 with bits-ui component inventory
```

Never commit unrelated files together. Never use `git add -A` blindly — stage only the files relevant to the current change.

## Release Process

Releases are triggered by pushing a tag to the upstream remote. GitHub Actions builds installers for macOS (arm64 + x86_64), Linux, and Windows.

### Version files

Three files must be kept in sync:

| File | Field | Constraint |
|---|---|---|
| `package.json` | `"version"` | SemVer, e.g. `0.2.0-beta.2` |
| `src-tauri/Cargo.toml` | `version` | SemVer, e.g. `0.2.0-beta.2` |
| `src-tauri/tauri.conf.json` | `"version"` | **Numeric only** (`MAJOR.MINOR.PATCH`) — MSI requires no pre-release string |
| `src-tauri/Cargo.lock` | auto | Reflects Cargo.toml version; must be committed |

`tauri.conf.json` must always use a plain numeric version (`0.2.0`). The pre-release label lives only in the git tag. If both share the same numeric version (e.g. beta.1 and beta.2 both use `0.2.0`), Windows MSI upgrades still work because the tag/release name identifies the channel.

### Changelog

CHANGELOG.md is generated by `git-cliff` (install via `cargo install git-cliff`):

```bash
# Preview what will be generated for a new tag
git-cliff v0.2.0-beta.1..HEAD --tag v0.2.0-beta.2

# Write the full changelog
git-cliff --tag v0.2.0-beta.2 -o CHANGELOG.md
```

The `cliff.toml` in the repo root configures grouping by conventional-commit type. `chore(changelog)` commits are automatically skipped.

### Release steps

```bash
# 1. Commit all pending changes (separate semantic commits)

# 2. Update version in package.json and Cargo.toml (pre-release label OK)
#    Keep tauri.conf.json at plain numeric version (e.g. 0.2.0)

# 3. Regenerate CHANGELOG.md
git-cliff --tag vX.Y.Z-<channel>.<N> -o CHANGELOG.md

# 4. Commit version bump + changelog
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md
git commit -m "chore: bump version to X.Y.Z-<channel>.<N>"

# 5. Tag and push
git tag vX.Y.Z-<channel>.<N>
git push origin master
git push origin vX.Y.Z-<channel>.<N>
```

### Tag naming and release channels

| Tag pattern | Channel | Pre-release |
|---|---|---|
| `vX.Y.Z-alpha.N` | Alpha | Yes |
| `vX.Y.Z-beta.N` | Beta | No (default public release channel) |
| `vX.Y.Z-rc.N` | RC | Yes |
| `vX.Y.Z` | Stable | No |

The workflow auto-detects the channel from the tag and sets the GitHub release as pre-release accordingly.

### Re-tagging after a fix

If CI fails after a tag is pushed, fix the issue, push the fix commit, then re-tag:

```bash
git tag -d vX.Y.Z-beta.N                    # delete local tag
git push origin :refs/tags/vX.Y.Z-beta.N    # delete remote tag
git tag vX.Y.Z-beta.N                        # re-create at new HEAD
git push origin vX.Y.Z-beta.N               # push to re-trigger CI
```

## Observability

Langfuse tracing is opt-in via a `.env` file in the project root (loaded at startup by `dotenvy`):

```
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_HOST=https://cloud.langfuse.com   # or LANGFUSE_BASE_URL as alias
```

When keys are present, spans are exported via OpenTelemetry batch processor. Chat and memory agent calls are instrumented with `gen_ai.*` attributes. Call `shutdown_tracing()` before process exit to flush pending spans.
