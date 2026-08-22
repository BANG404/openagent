# Configuration and application data

OpenAgent keeps user-scoped settings and durable application data under one
application-data root. Set `OPENAGENT_HOME` to choose that root explicitly.
Without an override, every platform uses `~/.openagent`, including Windows and
macOS. This keeps the complete OpenAgent home relocatable and gives command-line,
desktop, and test environments the same path contract.

The Tauri debug build defaults to the separate `~/.openagent-dev` root so a
development configuration schema cannot rewrite state used by an installed
release. Set `OPENAGENT_HOME` explicitly when a development run should use a
specific fixture or deliberately share another root.

An existing platform configuration directory—such as
`%APPDATA%\openagent` on Windows, `~/.config/openagent` on Linux, or the former
Application Support location on macOS—is moved to `~/.openagent` once when the
new root does not exist. The complete root moves together, including
configuration, conversations, logs, attachments, and other durable state.
OpenAgent never merges two populated roots automatically.

The root contains these user-maintained or durable files:

| Path                              | Purpose                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `config.toml`                     | Providers, model bindings, tool policy, UI preferences, onboarding completion, MCP, web search, and remote-gateway settings |
| `config.toml.bak`                 | Previous valid configuration used for startup recovery                                               |
| `memory.md`                       | Global user memory                                                                                   |
| `messages.db`                     | Conversation and checkpoint storage                                                                  |
| `messages.db.pre-schema-v<N>.bak` | SQLite-consistent snapshot retained before an automatic database schema upgrade                      |
| `backups/before-data-v1-*/`       | User-confirmed transition backup of settings and/or conversations replaced outside the support window |
| `scheduled_chat_hooks.json`       | Durable scheduled-chat definitions                                                                   |
| `logs/openagent.<date>.jsonl`     | Local structured application diagnostics; daily rotation with the latest 15 files retained           |
| `drafts/`, `DESIGN.md`            | Global drafts and design context                                                                     |
| `plugins/<name>/`                 | Validated installed Agent Plugin packages                                                             |
| `plugin-data/<name>/`             | Persistent writable `PLUGIN_DATA`, retained when a plugin is uninstalled                              |

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

First-run onboarding completion is stored as `onboarding_completed` in
`config.toml`, so it follows the selected `OPENAGENT_HOME` across desktop
WebView resets and workspace changes. This field is the only completion source:
the setup window opens when it is false and stays closed when it is true.
WebView local storage is not read or migrated for onboarding compatibility.

The first-run welcome and configuration flow opens in a dedicated setup window
while the bootstrapped main window stays hidden. Finishing setup applies the
selected workspace, reveals the main window, and closes setup. Development
builds can reopen the same setup window from the inspector without changing the
stored completion marker.

`config.toml` carries an explicit top-level `config_version`; the current
version is 1. At startup, OpenAgent loads the primary file and then a current,
last-known-good `config.toml.bak`. A valid current backup remains the recovery
source when the primary file is damaged or incompatible.

An interactive desktop that finds no current configuration in either location
stops before runtime or WebView construction and explains which settings and/or
conversation data is incompatible. The user may exit without changing data and
copy the reported application-data root, or choose **Back up and continue**.
Continuing first writes the complete affected files to a unique
`backups/before-data-v1-*/` directory and synchronizes them; only then does it
replace the affected scope with a fresh configuration or conversation store.
Failure to create a complete backup leaves the source data in place and stops
startup. Standalone/non-interactive startup never chooses on the user's behalf;
it returns an actionable transition-required error. Closing an unchanged
settings view also performs no configuration write.

## Context compaction

Automatic context compaction is enabled by default. A fresh or missing
`context_compaction_threshold` defaults to 200,000 approximate tokens. An
explicitly saved global threshold remains unchanged, and an optional per-model
threshold takes precedence for that model.

## Tool permissions

Tool approval controls whether an individual call pauses for review;
`permission_profile` independently controls the capabilities available after a
call is allowed. Approval never widens the active permission profile.

The General settings page exposes these as two separate controls, while the
conversation composer provides a shortcut for approval mode only. Approval has
`manual`, `auto`, and `off` modes and defaults to `off`; it never selects a
sandbox policy. In `auto`, all tool calls proposed in one model turn are
classified by one Flash request with an independent decision for each exact
tool-call ID; incomplete or unreliable results fall back to manual review.
**Execution Permissions & Sandbox** selects `managed` or
`disabled` enforcement. Managed enforcement offers canonical
workspace-writable and read-only presets, plus an advanced editor for ordered
`read`, `write`, and `deny` path rules. Network access is configured separately
as `restricted` or `enabled`. Disabling isolation is an explicit unsafe choice;
the UI warns that tools retain the ambient access of the OpenAgent process.
Opening the advanced editor from a canonical preset does not save an unchanged
profile; the configuration changes only after a path rule is edited, added, or
removed. This keeps the editor open across the settings save cycle while
preserving the original preset until the user makes a substantive change.

The default `managed` profile grants `read` access to the host filesystem and
`write` access to the active workspace; write access includes reading. Broad
writable roots keep `.git`, `.agents`, and `.codex` read-only unless a narrower
explicit write entry reopens a subtree. Managed profiles may contain multiple
filesystem entries using `read`, `write`, or `deny`. The most specific matching
path wins, and `deny` wins when equally specific entries conflict. A path with
no matching entry is rejected. `host_root` names the volume or filesystem root
containing the workspace, workspace entries may name a relative subpath, and
absolute entries name an additional host path. Existing targets and the
nearest existing ancestor of new targets are canonicalized before matching, so
`..` and existing symbolic-link ancestors cannot escape a managed root.

The `disabled` profile explicitly selects ambient host filesystem and network
access; it is not inferred from the approval mode. Managed profiles record
whether network access is `enabled` or `restricted`, defaulting to
`restricted`. The
runtime SDK now provides one shared process-sandbox contract for foreground,
background, resumed-approval, and delegated terminal launches. The desktop
product registers the native backend on every supported platform. Linux uses
Bubblewrap for mount and network namespace isolation. It prefers a compatible
system `bwrap` from `PATH`; that executable and its ancestor directories must
be root-owned and not group- or world-writable. Product bundles also carry the
`codex-bwrap` binary built from the SDK's pinned Codex revision as an offline
fallback. Release builds embed and verify the SHA-256 of the exact stripped
sidecar packaged by Tauri. macOS uses the fixed system `sandbox-exec` executable
and a deny-by-default Seatbelt policy. A managed terminal launch fails before
spawning when the selected backend or its trusted executable cannot enforce the
requested filesystem or restricted-network capability. Windows uses the pinned
Codex wrapper with capability SIDs, ACL overlays, inherited standard I/O, and a
kill-on-close Job Object. Network-enabled profiles use its non-elevated
restricted-token backend. Restricted profiles run under its elevated offline
account with persistent WFP filters. OpenAgent builds and bundles the matching
setup and command-runner helpers from the same immutable Codex revision; the
first restricted launch may request UAC consent for provisioning. Missing
helpers, declined elevation, or failed setup aborts the command without falling
back to a weaker process boundary. Global skill source remains read-only and
executable under managed isolation. Playwright CLI daemon files are redirected
to the sandbox-writable temporary directory by default, rather than widening
write access to the global skill tree or the user's cache; an explicit daemon
directory selected by the caller is preserved.

Built-in read, list, search, create, edit, and file-presentation tools run in
process, but they compile and enforce the same canonical managed filesystem
rules as terminal launches, including symlink and new-path handling. The
authorization match is exhaustive: only an explicit `disabled` profile grants
ambient access, and there is no separate host-delegated profile that can bypass
the file-tool boundary.

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

The model-service list and default-model provider selectors show the configured
service name together with the icon mapped from its provider type, independent
of the configured display name or base URL. Default-model selectors include the
icon in both the selected value and the option list. Every catalog provider type
must have a bundled icon; the exhaustive mapping makes a newly added type fail
type-checking until its asset is assigned. Artwork comes from Cherry Studio at
commit `16e2905fd30fbfe21d1c58651574dcc939b6fb30` where available, with missing
brands sourced from the provider's official site or project repository.

Default-model and retry-queue bindings treat the provider and model as one
selection. Changing a provider immediately replaces the model with that
provider's first available model, so a model name from the previous provider is
never displayed or persisted against the new provider. Model selection uses a
catalog menu with a separate, clearable search field; editing the search query
does not mutate the selected model.

User-facing settings and onboarding describe provider choices as model services;
they do not expose the runtime framework that implements those integrations.

Provider model catalogs are editable configuration rather than an authority on
account entitlements. In particular, the ChatGPT OAuth service exposes a
built-in catalog, which may lag the models available to an account. Its settings
and onboarding views therefore call out manual model entry; fetching that
catalog again replaces the configured model list, including manually added
names. Fetching a non-empty model catalog or successfully detecting a service
with a non-empty catalog also enables that model service and repairs unavailable
default-model bindings; an empty catalog leaves the service disabled. For
ChatGPT OAuth models, the composer exposes Light, Medium, High,
Extra High, and Ultra reasoning effort. The selection is stored per model and
projected to the Responses API as `reasoning.effort = low | medium | high |
xhigh | max`; chat retries, interrupt resumes, and flash-agent work use the
same model setting. A model without an explicit selection keeps the provider's
default (shown as Medium in the composer). OpenAgent does not currently expose
ChatGPT speed/service-tier controls, so request scheduling uses the provider
path's default.

OpenAgent validates `messages.db` before constructing the runtime. Schema v1 is
the current compatibility baseline. A database inside a future declared support
window must be upgraded through an explicit atomic migration with a consistent
pre-migration backup. A populated unversioned database, a database outside the
support window, or a structurally invalid current database instead enters the
interactive backup-and-fresh-store transition described above. The backup uses
SQLite itself so committed WAL data is included. Keep the reported backup until
the upgraded application and conversation behavior have been verified.

The current compatibility window is explicit:

| Stored schema                         | Startup behavior                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| No database or empty SQLite file      | Create schema v1                                                                |
| Populated unversioned legacy schema   | Ask; on consent back up consistently, then create a fresh schema v1 database    |
| Valid schema v1                       | Validate and open                                                               |
| Invalid schema v1 or higher schema    | Ask in desktop mode; back up and replace only on consent; non-interactive stops |

Configuration and database scopes are evaluated independently. For example, an
unversioned configuration paired with a valid schema v1 database resets only
settings; its conversation history remains active.
