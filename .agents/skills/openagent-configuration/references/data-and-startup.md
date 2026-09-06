# Configuration and application data

OpenAgent keeps user-scoped settings and durable application data under one
application-data root. Set `OPENAGENT_HOME` to choose that root explicitly.
Without an override, every platform uses `~/.openagent`, including Windows and
macOS. This keeps the complete OpenAgent home relocatable and gives command-line,
desktop, and test environments the same path contract.

The Tauri debug build defaults to the separate `~/.openagent-dev` root so a
development configuration schema cannot rewrite state used by an installed
release. Its ordinary startup uses the same supervised external Runtime boundary
as production. `bun run tauri:dev:embedded` is an explicit Runtime-local
diagnostic mode and is never an automatic startup fallback. That command enables
the compile-time `embedded-runtime` feature; ordinary debug and release desktop
binaries exclude the embedded Runtime bootstrap and command adapter. Set `OPENAGENT_HOME`
explicitly when a development run should use a specific fixture or deliberately
share another root.

Before constructing the desktop shell, the packaged `openagent-server` runs a
short-lived, versioned bootstrap command. It inspects configuration and database
compatibility inside the private SDK, returns locale and launch inputs as JSON,
and exits. When a destructive transition is required, Tauri presents the user
confirmation and asks that command to perform the backup and reset before it
starts the long-lived supervised server. The ordinary Tauri binary therefore
does not link the private SDK Rust crates.

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

| Path                              | Purpose                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `config.toml`                     | Providers, model bindings, tool policy, UI preferences, onboarding completion, MCP, and remote-gateway settings              |
| `config.toml.bak`                 | Previous valid configuration used for startup recovery                                                                        |
| `memory.md`                       | Global user memory                                                                                                            |
| `messages.db`                     | Conversation, checkpoint, follow-up suggestion, workspace-and-locale new-conversation suggestion, attachment, and rollback storage |
| `messages.db.pre-schema-v<N>.bak` | SQLite-consistent snapshot retained before an automatic database schema upgrade                                               |
| `backups/before-data-v1-*/`       | User-confirmed transition backup of settings and/or conversations replaced outside the support window                         |
| `scheduled_chat_hooks.json`       | Durable scheduled-chat definitions                                                                                            |
| `logs/openagent.<date>.jsonl`     | Local structured application diagnostics; daily rotation with the latest 15 files retained                                    |
| `drafts/`, `DESIGN.md`            | Global drafts and design context                                                                                              |
| `plugins/<name>/`                 | Validated installed Agent Plugin packages                                                                                     |
| `plugin-data/<name>/`             | Persistent writable `PLUGIN_DATA`, retained when a plugin is uninstalled                                                      |
| `resources/embedding/<model>/<version>/` | Verified, versioned local semantic-memory model resources shared by full and lightweight application updates           |
| `resources/runtime/<version>/<target>/` | Signed standalone Runtime candidates; installation is immutable and activation remains host-supervised                |
| `resources/frontend/<version>/`         | Signed static frontend versions served by the desktop's private protocol                                               |
| `resources/frontend/active.json`        | Atomically replaced active/previous frontend selection and pending-confirmation marker                                 |

Workspace-scoped memory, skills, drafts, and design files remain under that
workspace's `.agents/` directory rather than the user-scoped root.
