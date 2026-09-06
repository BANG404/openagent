<p align="center">
  <img src="assets/openagent_logo.png" alt="OpenAgent logo" width="240" />
</p>

<div align="center">

**A modern desktop AI agent client — built with Tauri, SvelteKit, and Rust.**

  <p>
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=white">
    <img alt="SvelteKit" src="https://img.shields.io/badge/SvelteKit-5-FF3E00?style=flat-square&logo=svelte&logoColor=white">
    <img alt="Rust" src="https://img.shields.io/badge/Rust-2021-000000?style=flat-square&logo=rust&logoColor=white">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white">
    <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white">
    <img alt="Bun" src="https://img.shields.io/badge/Bun-1.x-000000?style=flat-square&logo=bun&logoColor=white">
    <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square">
  </p>

  <p>
    English · <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

---

## Table of contents

- [Table of contents](#table-of-contents)
- [Changelog](#changelog)
- [Highlights](#highlights)
  - [Agent runtime](#agent-runtime)
  - [Interactive output](#interactive-output)
  - [Tools and integrations](#tools-and-integrations)
  - [Desktop experience](#desktop-experience)
- [Quick Start](#quick-start)
  - [Install a release build](#install-a-release-build)
  - [Prerequisites](#prerequisites)
  - [Clone \& install](#clone--install)
  - [Run in dev mode](#run-in-dev-mode)
  - [Build a distributable](#build-a-distributable)
- [Configure your first provider](#configure-your-first-provider)
  - [Choose a tool approval mode](#choose-a-tool-approval-mode)
- [Example: write a Skill](#example-write-a-skill)
- [Reusable roles and progressive Skill discovery](#reusable-roles-and-progressive-skill-discovery)
  - [Reusable delegated roles](#reusable-delegated-roles)
  - [Progressive Skill discovery](#progressive-skill-discovery)
- [Interactive prompts with `ask_user`](#interactive-prompts-with-ask_user)
- [AGUI — Inline Interactive Components](#agui--inline-interactive-components)
- [Web Preview via Tool Call (`render_web`)](#web-preview-via-tool-call-render_web)
- [Memory file format](#memory-file-format)
- [Agent memory controls](#agent-memory-controls)
- [Architecture at a glance](#architecture-at-a-glance)
- [Project structure](#project-structure)
- [Repository activity](#repository-activity)
- [Contributors](#contributors)
- [Contributing](#contributing)
- [Observability (optional)](#observability-optional)
- [Agent runtime real-model tests](#agent-runtime-real-model-tests)
- [Further reading](#further-reading)
- [License](#license)

---

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for release history and fixes.

---

## Highlights

### Agent runtime

- **Multi-Agent & Flash Agents Architecture** — A primary streaming **Chat Agent** for main conversations, and a suite of dedicated async **Flash Agents** (including **Memory Agent** for long-term memory synthesis, **Title Agent** for dynamic conversation renaming, and **Hook Agent** for background scheduled tasks).
- **Sub-Agent Delegation** — The Chat Agent can call `spawn_agent` to delegate tasks to nested sub-agents; progress streams in real-time into a sub-conversation shown nested under the parent in the sidebar.
- **Reusable Agent Roles** — Create global or project-scoped role workflows, discover them with hybrid search, and dispatch them as specialized child agents. Roles can be created automatically on first use or managed from the **Roles** panel.
- **Goal & Graph Loops (Autonomous Execution)** — Type `/goal` in the chat to run a self-correcting loop directly aiming at the objective. Type `/graph` to first plan a structured DAG task graph (`create_goal_graph_config`) and execute nodes asynchronously with parallel processing. The selected branch's durable checkpoint drives an auto-opening, resizable right panel for Goal to-dos and Graph node dependencies.
- **Hybrid Long-Term Memory** — SQLite + FTS5 + bundled, offline 384-dim embeddings (fastembed `AllMiniLML6V2Q`) blended with time decay for cross-session recall. Before retrieval, an optional Flash task rewrites the latest message into a focused semantic query, so stored memories are matched to intent rather than just wording.
- **Interactive User Prompts (`ask_user`)** — The agent can pause mid-task and surface a structured form to the user — `text`, `select`, `checkbox_group`, `confirm`, `date`, and more. The agent blocks until the user responds, then continues with the collected values. No more one-shot guessing on ambiguous instructions.

### Interactive output

- **AGUI — Inline Interactive Components** — The agent can embed file and URL capsules, ECharts visualisations, source-line previews, and image/video media directly in its prose — all rendered live by the streamdown engine.
- **Web Preview via Tool Call (`render_web`)** — The agent can display a local HTML file or an interactive HTTP(S) website directly in the conversation stream, enter fullscreen, or open remote pages in the system browser. Local files retain copy and PNG export actions.
- **Validated Mermaid Rendering** — A dedicated render tool validates Mermaid source before presenting the diagram, while keeping the source available and supporting fullscreen inspection.

### Tools and integrations

- **MCP-Native** — Connect external MCP servers over HTTP or stdio; tools are injected into the agent at call time.
- **First-class Dev Tools** — Built-in file, search, and terminal tools. Managed terminal sessions support interactive or long-running background processes.
- **Independent Approval & Runtime Permissions** — Choose when tool calls pause for review separately from the managed filesystem and network sandbox.
- **Skills System** — Drop a `SKILL.md` into `~/.agents/skills/` or `<workspace>/.agents/skills/`. Category-based progressive discovery keeps large global and project catalogs compact, with optional Flash classification for uncategorized Skills.
- **Portable Agent Plugins** — Install Agent Plugins 1.0.0 packages from **Settings → Agent Plugins**, with isolated Agent Skill and stdio/Streamable HTTP MCP discovery. See the [Agent Plugin reference](.agents/skills/openagent-plugin-development/references/package-format.md).
- **Messaging Channels** — Connect Feishu/Lark, Telegram, QQ, WeChat, Discord, or Slack from **Settings → Channels**. Each peer keeps its own workspace, model, role, and durable conversation, with commands for switching scope and replying to questions or approvals. See the [channel integration skill](.agents/skills/openagent-channel-integrations/SKILL.md).
- **Checkpoints & File-Change Rollback** — Every turn is a checkpoint with reverse diffs; undo a single file or rewind the whole agent.
- **Pluggable LLMs & Multimodal** — Support multi-model selection and durable image, PDF, and text attachments with drag/paste, rich previews, checkpoint restoration, and branch editing across Anthropic, OpenAI, and compatible providers.

### Desktop experience

- **Context Compaction & Tree Conversations** — Automatically or manually compact long conversations into tree structures to save tokens, preserving history lineage via search-based message recall.
- **Responsive Conversation History** — Search and paginate the sidebar, queue follow-up messages during a run, and navigate virtualized transcripts without loading the entire history into the DOM.
- **Scheduled Chat Hooks** — Define recurring or one-off tasks triggered in the background. Hooks are fully persistent, auto-restored on startup, and supported by system tray notifications.
- **Project Drafts & Global/Local Scopes** — Keep drafts, memory, and skills scoped globally (in `~/.openagent`) or locally to your active workspace (in `.agents/`).
- **DESIGN.md & MDX Editor** — Dedicated edit panel for `DESIGN.md` in your workspace, plus a rich markdown editor (MdxMarkdownEditor) integrated into memory and skill management.
- **Multi-Workspace Desktop Integration** — Repeated app launches restore and focus the existing primary window instead of starting another primary instance. Open each workspace in a dedicated window, focus existing workspace windows instead of duplicating them, launch on startup, minimize to the system tray, and reveal workspace locations in the native file manager.
- **Observability** — Optional Langfuse tracing via OpenTelemetry (`gen_ai.*` attributes).
- **Polished UI** — Apple-style design language, streaming markdown, Mermaid & ECharts rendering, light/dark themes, i18n (zh / en).

---

## Quick Start

### Install a release build

Download the latest installer or app bundle from [GitHub Releases](https://github.com/BANG404/openagent/releases). New users should choose the `full` bundle, which carries the local embedding seed; lightweight bundles download and verify it in the welcome window. Later automatic updates always use the lightweight application artifact and preserve the installed model. OpenAgent publishes separate **beta**, **RC**, and **stable** update channels; you can also check for updates manually from Settings.

To build from source instead, continue below.

### Prerequisites

| Tool | Version | Notes                                        |
| ---- | ------- | -------------------------------------------- |
| Bun  | latest  | Package manager — used instead of npm / yarn |
| Rust | 1.70+   | Required for the Tauri backend               |
| Node | 18+     | Used by the SvelteKit toolchain              |

> On Windows the Tauri prerequisites also include WebView2 and the MSVC build tools. See the [official Tauri prerequisites](https://tauri.app/start/prerequisites/) for platform-specific setup.

### Clone & install

```bash
git clone --recurse-submodules https://github.com/BANG404/openagent.git
cd openagent
bun install
```

The runtime SDK is a private submodule. Source builds require access to
`BANG404/openagent-sdk` and an SSH key accepted by GitHub. For an existing
checkout, initialize it with `git submodule update --init --recursive` before
installing or building.

The desktop Cargo workspace also pins the proxy-capable WebSocket forks
required by the audited Codex Windows sandbox revision used by the SDK. Keep
those root-level patches and the compatible `blake3` lock aligned when
advancing the SDK gitlink; Cargo does not inherit patches from a transitive
workspace, and the sandbox policy parser requires its exact hashing version.

### Run in dev mode

```bash
# Full Tauri desktop app (frontend + Rust backend)
bun tauri dev

# OR — frontend only (selects an available port, no Rust)
bun run dev
```

Development commands select an available loopback port. `bun tauri dev` passes that port to Vite so the desktop host and frontend always agree.

Debug desktop builds use `~/.openagent-dev` by default, keeping development
configuration and data separate from an installed release. Set
`OPENAGENT_HOME` explicitly to use another development root.

### Build a distributable

```bash
bun run tauri:build       # lightweight installer and updater artifact
bun run tauri:build:full  # first-install bundle with embedding seed
```

The built installers / app bundle land in `src-tauri/target/release/bundle/`.
Windows builds produce the NSIS installer only; Linux and macOS retain their
native bundle targets. The release workflow signs and publishes the lightweight
build as the sole automatic updater input and uploads the full build under a
`-full` filename for manual first installation.
On Linux this command builds the pinned Codex Bubblewrap sidecar, strips it,
embeds its SHA-256 in the release binary, and packages the same bytes. Linux
source builds therefore also require `libcap` development headers, `pkg-config`,
and GNU `strip` (usually provided by `binutils`).

---

## Configure your first provider

On first launch OpenAgent creates `config.toml` in its cross-platform user data root (`~/.openagent` on Linux, macOS, and Windows). Set `OPENAGENT_HOME` to override the complete root. Open **Settings → Providers** and add a provider, or edit the file directly; valid external edits hot-reload. See the [configuration skill](.agents/skills/openagent-configuration/SKILL.md) for atomic-save, backup, migration, and conflict behavior. Until an available model is configured, the composer keeps sending disabled and provides a **Configure models** shortcut to Settings.

```toml
config_version = 1

[[providers]]
id = "anthropic-main"
name = "Anthropic"
provider = "anthropic"
api_key = "sk-ant-..."
base_url = "https://api.anthropic.com"
enabled = true

[defaults]
chat_model   = { provider_id = "anthropic-main", model = "claude-sonnet-4-6" }
flash_model  = { provider_id = "anthropic-main", model = "claude-haiku-4-5" }
```

OpenAI-compatible endpoints (DeepSeek, OpenRouter, local Ollama, etc.) work the same — just point `base_url` at the right host and set `provider = "openai"`. You may enter a host, a `/v1` API root, or a full `/chat/completions` URL; OpenAgent normalizes it to the API root.

### Choose a tool approval mode

Use the approval selector in the conversation composer, or open **Settings → General → Approval Mode**, to control when agent tool calls pause for review. Approval defaults to **Off** and is independent from runtime permissions: approving a call never expands its filesystem or network capabilities.

| Mode          | Behavior                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- |
| **Manual**    | Ask you to approve every tool call.                                                          |
| **Automatic** | A Flash task assesses the impact; important or uncertain calls still come to you for review. |
| **Off**       | Run all tool calls without the approval flow.                                                |

Use **Settings → General → Execution Permissions & Sandbox** for the actual confinement policy. The recommended managed profile offers workspace-writable, read-only, and advanced path-rule presets plus restricted or enabled networking. The default grants host-wide reads and workspace-scoped writes, keeps `.git`, `.agents`, and `.codex` read-only beneath broad writable roots, and restricts network access. External mode delegates isolation to the embedding host; disabled mode explicitly uses ambient process access and displays a warning. Managed terminal processes are isolated with Bubblewrap on Linux, Seatbelt on macOS, and the pinned Codex sandbox on Windows. Missing helpers or failed setup abort the command without falling back to ambient access, and built-in file tools enforce the same canonical filesystem policy independently of the terminal backend.

---

## Example: write a Skill

Create `~/.agents/skills/python-review/SKILL.md`:

```markdown
---
name: python-review
description: Review Python diffs for type-hint coverage, error handling, and PEP 8 compliance.
---

When asked to review Python code:

1. Check that public functions have type hints.
2. Flag bare `except:` clauses and silent failures.
3. Suggest more idiomatic stdlib alternatives where appropriate.
```

That's it — OpenAgent picks it up on the next message and lists it in the agent's system prompt. The agent reads the full body on demand via `read_file`.
OpenAgent also installs the bundled `find-skills` Skill into this global directory when it is missing.
When that Skill is available, the agent receives an explicit reminder to use it proactively for material capability gaps in specialized, complex, or deep work. It reuses installed Skills first, reviews third-party candidates before installation, defaults repository-specific additions to `<workspace>/.agents/skills/`, and reserves `~/.agents/skills/` for capabilities intended to work across unrelated projects.

---

## Reusable roles and progressive Skill discovery

### Reusable delegated roles

Open **Roles** in the sidebar to create and manage specialized workflows such as a code reviewer, release manager, or research assistant. A role contains a stable name plus the responsibilities, boundaries, workflow, and delivery standards appended to the delegated agent's system prompt.

- **Global roles** are reusable in every workspace.
- **Project roles** are visible only in the current workspace.
- The main agent can create a role on first dispatch, find saved roles by name or responsibility, and reuse them in child conversations. The Roles panel shows usage count and last-used time.

### Progressive Skill discovery

For a large Skill catalog, add a category under the frontmatter `metadata` map:

```yaml
---
name: python-review
description: Review Python diffs for correctness and maintainability.
metadata:
  category: code-quality
---
```

OpenAgent initially exposes compact category summaries and loads the matching Skill descriptions on demand. When the optional **Settings → Flash Tasks → Skill Category Task** is enabled, the app categorizes ungrouped Skills in the background after startup or a workspace switch and persists the result to `metadata.category` in each `SKILL.md`.

---

<a id="interactive-prompts-with-ask_user"></a>

## Interactive prompts with `ask_user`

When the agent needs a decision before continuing — ambiguous instruction, technology choice, destructive operation, missing parameter — it calls `ask_user` to surface a structured form in the chat panel. The agent blocks until you respond; everything in the form is typed, so you can select from dropdowns, tick checkboxes, confirm a boolean, or pick a date without typing a sentence.

Supported field types:

| Type             | Use case                     |
| ---------------- | ---------------------------- |
| `text`           | Short free-form input        |
| `textarea`       | Multi-line text              |
| `select`         | Single choice from a list    |
| `checkbox`       | Single on/off toggle         |
| `checkbox_group` | Multiple choices from a list |
| `date`           | Date picker                  |
| `confirm`        | Yes / No decision            |

The agent is guided to ask once, ask clearly, and prefer structured fields over open text boxes.

---

<a id="agui--inline-interactive-components"></a>

## AGUI — Inline Interactive Components

Beyond markdown, the agent can embed interactive components directly in its responses. The frontend's streamdown renderer picks them up and renders them as rich, clickable elements — no copy-pasting paths or URLs needed.

Syntax: `ComponentName(prop: value, prop2: "string")`

| Component | Example                                                | Renders as                                                |
| --------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `File`    | `File(path: "src/tools.rs", lines: "120-140")`         | Clickable chip that opens the file at the given lines     |
| `Url`     | `Url(href: "https://docs.rs/rig", title: "rig docs")`  | Capsule that opens the link in the browser                |
| `Chart`   | `Chart(type: "bar", labels: ["A","B"], data: [10,20])` | ECharts bar / line / pie chart                            |
| `Image`   | `Image(src: "assets/result.png", caption: "Result")`   | Workspace path, `file://`, `data:image`, or HTTP(S) image |
| `Video`   | `Video(src: "assets/demo.mp4", controls: true)`        | Workspace-local or HTTP(S) video with playback controls   |

Multi-series charts use `series: [{name, data}, ...]`.

---

<a id="web-preview-via-tool-call-render_web"></a>

## Web Preview via Tool Call (`render_web`)

Instead of writing inline component tags, the agent can execute `render_web` with either a workspace `.html`/`.htm` path or an HTTP(S) URL. Local files resolve sibling assets through the workspace-scoped preview protocol and support copy and best-effort PNG export. Remote websites keep scripts and forms interactive inside the sandbox, support fullscreen display and a system-browser shortcut, and may still refuse iframe embedding through their own CSP or `X-Frame-Options` policy.

---

## Memory file format

Memory files have **two zones**. The Memory Agent only writes below the marker comment:

```markdown
## [User] Personal habits

<!-- You edit freely here; the agent never touches this section -->

## [Agent] Recent context summary

<!-- Memory Agent only operates below this comment -->
```

- Global memory → `~/.openagent/memory.md` (every conversation)
- Local memory → `<workspace>/.agents/memory.md` (workspace-scoped)

## Agent memory controls

Open **Settings → Flash Tasks → Memory Task** to configure the long-term-memory workflow:

- **Automatic agent memory retrieval** is disabled by default, leaving the chat agent to decide when a turn needs the `search_agent_memory` tool. Enabling it adds a preflight to every turn that uses the Flash model to turn the current message into a focused query, retrieves relevant structured memory, and adds the results to the chat agent's system prompt.

Disabling the Memory Agent stops its post-conversation extraction task; automatic retrieval remains independently configurable. New conversations use fixed localized greeting copy and never generate it from memory.

The independent **Follow-up Suggestions** Flash task generates three actionable messages after each completed Agent turn. It also refreshes three new-conversation suggestions from up to the five most recently updated conversation titles after a title task completes. Selecting a suggestion sends it immediately as the next user message.

---

## Architecture at a glance

```
┌──────────────────────────────┐    typed client/events    ┌──────────────────────────────┐
│   SvelteKit Webview (src/)   │  ◄────────────────────►  │  Private SDK submodule       │
│   components · interaction   │                          │  runtime · backend · transport│
└──────────────────────────────┘                          └──────────────────────────────┘
                 │                                                     │
                 └──────────── thin Tauri host (src-tauri/) ───────────┘
```

See [`AGENTS.md`](AGENTS.md) for the public host/frontend contributor guide.
SDK internals and their contributor documentation are maintained in the
private submodule.

---

## Project structure

```
.
├── src/                      # SvelteKit frontend (Svelte 5 · TypeScript)
│   ├── routes/               # Page components
│   └── lib/                  # Components, stores, streamdown, types
├── src-tauri/                # Tauri adapters, build config, and packaging
├── sdk/                      # Pinned private SDK Git submodule
└── .agents/skills/           # Focused architecture and contributor guidance
```

---

## Repository activity

![Alt](https://repobeats.axiom.co/api/embed/6192dc6d5dec9295a44312fb2bba5b0d362280e2.svg "Repobeats analytics image")

---

## Contributors

Thanks goes to these wonderful people:

<a href="https://github.com/BANG404/openagent/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=BANG404/openagent" alt="Contributors" />
</a>

---

## Contributing

Contributions are very welcome — feature ideas, bug fixes, and docs improvements alike.

1. Fork the repo and create a branch from `master`.
2. Follow the [Conventional Commits](https://www.conventionalcommits.org/) style — see existing log for the scopes we use (`feat(toast):`, `fix(mermaid):`, `refactor(ui):`, etc.).
3. Run `bun run check`, `bun run lint:actions`, and `cargo check --manifest-path src-tauri/Cargo.toml` before opening a PR.
4. Open a PR — describe **why**, not just **what**.

Project conventions live in [`AGENTS.md`](AGENTS.md); the UI/UX spec is routed by the [design-system skill](.agents/skills/openagent-design-system/SKILL.md).

---

## Observability

OpenAgent writes daily structured application logs under
`<OPENAGENT_HOME>/logs` and retains the latest 15 files. Privacy-filtered error
diagnostics are sent to the OpenAgent OTLP endpoint by default and can be
disabled immediately in **Settings → General → Privacy & diagnostics**. Remote
logs never include conversations, model output, tool arguments, configuration
values, secrets, raw frontend error messages, or stack traces.

![Privacy and diagnostics setting](.agents/skills/openagent-configuration/assets/diagnostic-log-collection-en.png)

Langfuse model tracing remains optional and separate from application logs.

Drop a `.env` in the project root to enable Langfuse tracing:

```env
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

When keys are present, Chat & Memory agent calls are instrumented with `gen_ai.*` OpenTelemetry attributes and exported via batch processor.

### Agent runtime real-model tests

The SDK software test suite includes ignored real-provider tests for both the canonical Chat agent runtime and Flash structured-output tasks. Put the local test-model settings in the repository root `.env`:

```env
OPENAGENT_TEST_MODEL=your-model
OPENAGENT_TEST_API_KEY=your-api-key
OPENAGENT_TEST_BASE_URL=https://your-provider.example/v1
# OPENAGENT_TEST_PROVIDER=openai

# Optional Langfuse tracing
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

Then run:

```bash
cd sdk
bun scripts/test-agent-runtime-model.mjs --base origin/main
```

See [`.env.example`](.env.example) for a copyable template. The script checks the diff first: when no file under `rust/openagent-runtime/` changed, it prints a skip and makes no model calls. When the runtime changed, it runs the Chat runtime smoke plus Flash structured-output coverage with the same local model. The test defaults to the OpenAI-compatible provider.

For Anthropic, set `OPENAGENT_TEST_PROVIDER=anthropic` and provide `OPENAGENT_TEST_API_KEY` or `ANTHROPIC_API_KEY`.

---

## Further reading

- [`AGENTS.md`](AGENTS.md) — Public host and frontend contributor guide
- [`CHANGELOG.md`](CHANGELOG.md) — Full release history
- [Agent Plugin skill](.agents/skills/openagent-plugin-development/SKILL.md) — installation, validation, components, and data boundaries
- [Channel integration skill](.agents/skills/openagent-channel-integrations/SKILL.md) — platform setup, scoped commands, remote gateway, persistence, and security
- [Release engineering skill](.agents/skills/openagent-release-engineering/SKILL.md) — versioning, beta/RC/stable channels, CI, and publishing
- [Embedding resource skill](.agents/skills/openagent-embedding-resources/SKILL.md) — bundled model provenance, size, verification, and activation
- [Harness SDK skill](.agents/skills/openagent-harness-sdk/SKILL.md) — headless third-party integration without publishing the core runtime
- [Update delivery skill](.agents/skills/openagent-update-delivery/SKILL.md) — frontend HMR, independent Runtime binaries, reloads, and desktop boundaries
- [Design-system skill](.agents/skills/openagent-design-system/SKILL.md) — visual language, components, responsiveness, and `DESIGN.md`
- [Tauri docs](https://tauri.app/) · [SvelteKit docs](https://kit.svelte.dev/) · [rig (Rust LLM)](https://github.com/0xPlaygrounds/rig)

---

## License

OpenAgent is dual-licensed:

- **Open-source option:** [GNU GPL v3.0 or later](LICENSE) (`GPL-3.0-or-later`).
  If you distribute OpenAgent or a derivative work under this option, the GPL
  requires the corresponding source and GPL freedoms to be provided under its
  terms; it does not allow a derivative work to be distributed as proprietary.
- **Commercial option:** a separate [commercial license](COMMERCIAL_LICENSE.md)
  is available for organizations that need to distribute a proprietary
  derivative work or otherwise need rights outside the GPL.

Commercial licensing is provided only through a separate written agreement.
The OpenAgent name and branding remain subject to
[TRADEMARKS.md](TRADEMARKS.md).
