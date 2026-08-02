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
| `messages.db.pre-schema-v<N>.bak` | SQLite-consistent snapshot retained before an automatic database schema upgrade |
| `scheduled_chat_hooks.json` | Durable scheduled-chat definitions |
| `logs/openagent.<date>.jsonl` | Local structured application diagnostics; daily rotation with the latest 15 files retained |
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

## Software error collection

`diagnostic_log_collection_enabled` defaults to `true` and is exposed in
General settings. It controls remote diagnostic upload immediately without an
application restart. Turning it off stops OTLP export while continuing to keep
rotating local logs so the user can inspect or deliberately share them during
support.

Remote diagnostics contain application version, operating system, architecture,
severity, an allowlisted event name, component, and error type. They exclude
conversation content, prompts, model output, tool arguments and results,
configuration values, credentials, file contents, raw frontend error messages,
and stack traces. Model-context spans remain isolated in the optional Langfuse
pipeline and are not application logs.

Release builds receive the write-only ingestion credential from the
`OPENAGENT_LOGS_INGEST_TOKEN` repository secret. Local builds may set the same
environment variable and may override the default
`https://openagentlogs.odn.cc/v1/logs` destination with
`OPENAGENT_LOGS_ENDPOINT`.

Provider model catalogs are editable configuration rather than an authority on
account entitlements. In particular, the ChatGPT OAuth service exposes Rig's
built-in catalog, which may lag the models available to an account. Its settings
and onboarding views therefore call out manual model entry; fetching that
catalog again replaces the configured model list, including manually added
names. For ChatGPT OAuth models, the composer exposes Light, Medium, High,
Extra High, and Ultra reasoning effort. The selection is stored per model and
projected to the Responses API as `reasoning.effort = low | medium | high |
xhigh | max`; chat retries, interrupt resumes, and flash-agent work use the
same model setting. A model without an explicit selection keeps the provider's
default (shown as Medium in the composer). OpenAgent does not currently expose
ChatGPT speed/service-tier controls, so request scheduling uses the provider
path's default.

OpenAgent upgrades an older `messages.db` automatically at startup. A populated
database is backed up before migration, and the migration either commits in
full or leaves the original schema unchanged. If the database was created by a
newer OpenAgent version, or validation/migration fails, startup stops rather
than continuing without conversation persistence. Keep the reported backup
until the upgraded application and conversation history have been verified.

The current compatibility window is explicit:

| Stored schema | Source releases | Startup behavior |
| --- | --- | --- |
| No database | Any clean installation | Create schema v1 |
| Unversioned legacy schema | `v0.25.0-beta.1` through `v0.29.1-beta.1` | Back up, recognize known legacy table shapes, migrate atomically to v1 |
| Schema v1 | Current release line | Validate and open |
| Higher than schema v1 | A newer OpenAgent build | Refuse to open without modifying the database |

Unreleased databases older than `v0.25.0-beta.1` are not implicitly declared
compatible. They are migrated only when their tables match a known legacy
shape; otherwise startup stops with the original database and migration backup
preserved.
