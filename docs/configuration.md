# Configuration and application data

OpenAgent keeps user-scoped settings and durable application data under one
application-data root. Set `OPENAGENT_HOME` to choose that root explicitly.
Without an override, Linux uses `~/.openagent`, Windows uses
`%APPDATA%\openagent`, and macOS uses the platform Application Support directory.
`OPENAGENT_CONFIG_DIR` remains an alias for deployments that already set it.

On Linux, an existing `~/.config/openagent` directory is moved to
`~/.openagent` once when the new root does not exist. OpenAgent never merges two
populated roots automatically.

The root contains these user-maintained or durable files:

| Path | Purpose |
| --- | --- |
| `config.toml` | Providers, model bindings, tool policy, UI preferences, MCP, web search, and remote-gateway settings |
| `config.toml.bak` | Previous valid configuration used for startup recovery |
| `memory.md` | Global user memory |
| `messages.db` | Conversation and checkpoint storage |
| `scheduled_chat_hooks.json` | Durable scheduled-chat definitions |
| `drafts/`, `DESIGN.md` | Global drafts and design context |

Workspace-scoped memory, skills, drafts, and design files remain under that
workspace's `.agents/` directory rather than the user-scoped root.

## Save and reload behavior

Settings changes are debounced briefly in the UI. Every backend configuration
mutation then acquires both a process-local ordering lock and a cross-process
`config.lock`, rereads the latest file, normalizes the result, and replaces
`config.toml` atomically. The temporary file is written and synchronized in the
same directory before replacement. A valid previous file is retained as
`config.toml.bak`.

The settings UI submits the configuration snapshot it originally edited.
Independent changes from another window or direct file edit are merged. If both
writers changed the same field differently, saving is rejected and the latest
saved configuration is reloaded instead of silently overwriting either value.

Running desktop and standalone processes inspect `config.toml` every 750 ms.
A valid external edit updates the in-memory runtime, refreshes configuration-
derived tools, and updates open desktop surfaces. Invalid TOML or a removed file
does not replace the last valid in-memory configuration; the desktop reports the
reload failure and begins using the file again after it becomes valid.
If the user saves through the UI while the file is missing or invalid, the
write starts from the runtime's last validated snapshot and repairs the
canonical file instead of resetting unspecified fields to defaults.

Provider API keys and other credentials in `config.toml` are local plaintext.
Protect the application-data directory with normal operating-system account
permissions and do not commit it to source control.
