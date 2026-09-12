## Save and reload behavior

Provider model entries may persist `model_vision_enabled` flags. Missing flags
are normalized to disabled; only an enabled model receives image input and the
`view_image` tool in its provider request. Removing or renaming a model also
removes or migrates its vision flag.

OpenAI provider entries persist `openai_api_mode`. Missing values normalize to
`responses`; `chat_completions` is the explicit fallback for compatible
services without Responses support. Settings and onboarding accept
a host, API root, or complete OpenAI endpoint as `base_url` and continuously
show the normalized final request URL beneath the input, including the selected
`/responses` or `/chat/completions` suffix.

Every successful in-app save publishes a payload-free configuration-change
notification after persistence. Each open frontend surface then reloads through
the local settings command and applies only its newest outstanding read. An
authoritative save result invalidates older reads before it updates local state,
so a delayed response cannot restore configuration from before that save.

Lifecycle automation rules are part of the versioned configuration snapshot.
They can run a terminal command or add an Agent message before or after a model
or tool call, with an optional regular-expression tool matcher. Commands run in
the active workspace under the current managed permission sandbox; their stdin
is a structured event and successful stdout becomes bounded Agent context.
Failures remain diagnostic and do not fail the conversation.

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

Older `[web_search]` and `[fetch]` tables are ignored when loading configuration
and disappear on the next successful settings save. Webpage search and fetching
are not built-in Agent capabilities.

Each native MCP server entry stores a `disabled_tools` list alongside its
connection settings. Settings probes the server and displays every currently
advertised tool with an individual enable switch. Disabled names remain visible
and persisted, but they are omitted from the Agent's tool definitions and from
the dispatch registry. A server-level enable switch still controls the whole
connection. MCP `tools/list_changed` updates are reflected on the next Agent
turn while preserving configured disabled names, including names that
temporarily disappear and later return.

The product-managed Cua Driver entry is seeded and normalized during the first
desktop startup bootstrap, before the first chat turn. Its reserved stdio
command uses the driver's direct MCP mode so the generic MCP client can discover
and call tools without Cua-specific per-request metadata; Settings can still
change its permission mode and disabled-tool list.

Provider API keys and other credentials in `config.toml` are local plaintext.
Protect the application-data directory with normal operating-system account
permissions and do not commit it to source control.

First-run onboarding completion is stored as `onboarding_completed` in
`config.toml`, so it follows the selected `OPENAGENT_HOME` across desktop
WebView resets and workspace changes. It records configuration completion, but
the main application also requires a verified embedding resource. A configured
installation whose resource is absent or corrupt reopens the setup window on
the resource-only final step until repair succeeds. WebView local storage is
not read or migrated for onboarding compatibility.

The first-run welcome and configuration flow opens in a dedicated setup window
while the bootstrapped main window stays hidden. Finishing setup applies the
selected workspace, reveals the main window, and closes setup only after the
embedding resource is installed, SHA-256 verified, and loaded. Resource
preparation starts in the background when setup mounts: full installers copy
their packaged seed, while lightweight installers download the same immutable
GitHub-hosted files. Files are staged and verified before atomic activation;
partial downloads never become runtime input. Development builds can reopen the
same setup window from the inspector without changing the stored completion
marker.

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
