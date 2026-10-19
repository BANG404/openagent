# Configuration and application data

Independent signed version restrictions and their startup/update admission follow
[online compatibility policy](compatibility-policy.md).

The desktop page delegates startup sequencing to `src/lib/page/startup.ts`.
It restores the durable bootstrap before installing Runtime event delivery,
retries a lost bootstrap once, restores durable fallback state on failure,
and keeps event registration single-attempt. The page supplies its existing
configuration, loading state, restore surface, and conversation selection
through writable typed dependencies; startup never creates another transcript
or stream owner. Window reveal waits for rendering and uses durable
`onboarding_completed` to choose setup or the main shell. Resource checks run
inside first-use setup before completion is saved; a configured installation
does not query embedding status or reopen onboarding on startup. Native resource
admission retains its recovery surface for actual resource or launch failures.

`src/lib/page/workspaceNavigation.ts` owns preparation and application of a
workspace switch. It resolves roles, the selected durable conversation, its
lineage, checkpoint tree, pending input, file changes, and suggestions before
committing the writable page state. A failed preparation restores the Runtime's
previous workspace. The mounted shell and per-workspace conversation snapshots
stay intact through this transition; normal navigation uses the current window.

OpenAgent keeps user-scoped settings and durable application data under one
application-data root. Set `OPENAGENT_HOME` to choose that root explicitly.
Without an override, production uses `~/.openagent`, including Windows and
macOS. Alpha desktop releases use `~/.openagent-alpha`, passed explicitly to
the supervised Runtime. This keeps the complete OpenAgent home relocatable and gives command-line,
desktop, and test environments the same path contract.

The Tauri debug build defaults to the separate `~/.openagent-dev` root so a
development configuration schema cannot rewrite state used by an installed
release. Its ordinary startup uses the same supervised external Runtime boundary
as production. The shell never embeds execution or links private Rust code. Set `OPENAGENT_HOME`
explicitly when a development run should use a specific fixture or deliberately
share another root.

Before constructing the desktop shell, the packaged `openagent-server` runs a
short-lived, versioned bootstrap command. Public App policy inspects the shared
configuration contract and asks the engine's storage-maintenance adapter about
database compatibility, then returns locale and launch inputs as JSON,
and exits. When a destructive transition is required, Tauri presents the user
confirmation and asks that command to perform the backup and reset before it
starts the long-lived supervised server. The ordinary Tauri binary therefore
does not link the private SDK Rust crates.
`crates/openagent-app/src/persistence.rs` owns transition scope and backup
destinations. It finishes every requested backup before resetting either scope;
the private adapter alone inspects, backs up and resets conversation storage.
Supported storage upgrades require restart, never a destructive reset. Public
`openagent-config` owns config normalization and atomic persistence; the running
server remains the authoritative settings writer. Initial product preparation
runs before execution services, and fails if a fresh config cannot be persisted.
The host adapters live in `src-tauri/src/desktop_bootstrap/`: mode selection
composes prepared inputs, persistence presents the existing backup confirmation,
and external startup selects verified or packaged binaries. They do not inspect
or mutate configuration and database files themselves.
Additive database upgrades, such as creating a new optional feature table, are
applied transactionally by the Runtime without entering this confirmation
flow; the Runtime keeps a SQLite snapshot beside `messages.db` for rollback.
Known unversioned configuration is normalized atomically by the long-lived
Runtime after bootstrap inspection, with the original bytes retained in
`config.toml.pre-v1.bak`; it does not enter the destructive transition flow.
Supported release updates must keep settings and conversation records visible
after bootstrap and repeated startup without entering backup-and-reset. The CD
artifact check and its baseline policy are owned by release engineering's
[qualification reference](../../openagent-release-engineering/references/qualification.md).
Changing startup inspection or persisted formats requires maintaining both the
SDK's historical migration coverage and that published-version artifact check.

In ordinary debug and release desktop builds, one supervised external Runtime
is the sole writer for `OPENAGENT_HOME`. The Tauri host does not construct a
second embedded Runtime against the same root. A packaged Runtime binary is retained only as a
verified launch fallback; downloaded candidates are installed under
`resources/runtime/` and become writers only after the old supervised process
has drained and exited. Each desktop window supervises one Runtime whose selected
workspace changes with current-window navigation. The server authorizes that
selected existing directory rather than retaining a startup-only workspace
allowlist. Only the explicit File -> New window action launches another desktop
process and Runtime. Tray Quit is application-wide: it signals every desktop
process launched by the current OpenAgent process tree, lets each window stop its
own Runtime within the bounded shutdown window, and forcibly reaps any child that
does not exit. Child windows also close when their launching process disappears.

An existing platform configuration directory—such as
`%APPDATA%\openagent` on Windows, `~/.config/openagent` on Linux, or the former
Application Support location on macOS—is moved to `~/.openagent` once when the
new root does not exist. The complete root moves together, including
configuration, conversations, logs, attachments, and other durable state.
OpenAgent never merges two populated roots automatically.

The root contains these user-maintained or durable files:

| Path                                     | Purpose                                                                                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.toml`                            | Providers, model bindings, tool policy, UI preferences, onboarding completion, MCP, and remote-gateway settings                                                                                                            |
| `config.toml.bak`                        | Previous valid configuration used for startup recovery                                                                                                                                                                     |
| `config.toml.pre-v1.bak`                 | Immutable copy retained while an unversioned legacy configuration is normalized to the versioned shape                                                                                                                     |
| `memory.md`                              | Global user memory                                                                                                                                                                                                         |
| `messages.db`                            | Runtime-owned conversations, checkpoints, suggestions, attachments, and inert legacy file snapshot rows; plugin domain state belongs to each package's `PLUGIN_DATA`                                                       |
| `messages.db.pre-schema-v<N>.bak`        | SQLite-consistent snapshot retained before an automatic database schema upgrade                                                                                                                                            |
| `backups/before-data-v1-*/`              | User-confirmed transition backup of settings and/or conversations replaced outside the support window                                                                                                                      |
| `scheduled_chat_hooks.json`              | Durable scheduled-chat definitions                                                                                                                                                                                         |
| `logs/openagent.<date>.jsonl`            | Runtime diagnostics; daily rotation with the latest 15 files retained                                                                                                                                                      |
| `logs/openagent-host.jsonl.<date>`       | Native host and component-update diagnostics; separately rotated with the latest 15 files retained                                                                                                                         |
| `drafts/`, `DESIGN.md`                   | Global drafts and design context                                                                                                                                                                                           |
| `plugins/<name>/`                        | Validated installed Agent Plugin packages                                                                                                                                                                                  |
| `plugin-data/<name>/`                    | Persistent writable `PLUGIN_DATA`, retained when a plugin is uninstalled                                                                                                                                                   |
| `plugin-settings/<name>.json`            | Versioned private plugin configuration, retained on update/uninstall; the plugin owner reference defines schema, protection and repair                                                                                     |
| `resources/embedding/<model>/<version>/` | Verified, versioned local semantic-memory model resources shared by full and lightweight application updates                                                                                                               |
| `resources/runtime/<version>/<target>/`  | Signed standalone Runtime candidates; installation is immutable and activation remains host-supervised                                                                                                                     |
| `resources/updates/shell-handoff.json`   | Versioned shell-first component continuation; contains only the verified target shell version, never executable paths or product data                                                                                      |
| `resources/runtime/plugin-update.json`   | Host-owned verified Runtime resource identity for interrupted plugin-transaction recovery                                                                                                                                  |
| `resources/runtime-plugin-update/`       | Runtime-owned version plan, prepared plugin packages and rollback snapshots; preserve this directory when recovery fails                                                                                                   |
| `resources/frontend/<version>/`          | Signed static frontend versions served by the desktop's private protocol                                                                                                                                                   |
| `resources/frontend/active.json`         | Atomically replaced active/previous frontend selection and pending-confirmation marker; a pending marker outlives the process that wrote it, so the next process serves that candidate under a fresh confirmation deadline |

Workspace-scoped memory, skills, and drafts live under the workspace's `.agents/`
directory. Workspace design context lives at `<workspace>/DESIGN.md`, outside
`.agents/`. These paths are separate from the user-scoped application root.

Shell resource cache lives under `<OPENAGENT_HOME>/resources/distributions/<release>/`.
It contains signed immutable manifests, staged bytes and content-addressed partial
HTTP transfers; it never contains provider credentials. Initial release startup
opens the shell before resource download. Runtime's existing inspected backup and
transition flow runs only after verified installation. Missing resources do not
force deletion or normalization of persisted configuration or conversations.

Package lifecycle follows [plugin enablement](plugin-enablement.md). Persisted plugin-owned MCP
projections remain readable for recovery but are not mounted or edited as user
servers. Runtime resolves their current launch from the installed package.
