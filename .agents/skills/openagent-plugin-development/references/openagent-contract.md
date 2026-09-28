# OpenAgent plugin contract

This document owns the OpenAgent-specific extension contract layered on the
portable Agent Plugins 1.0.0 package format. The portable root remains
`plugin.json`, with optional `skills/` and `mcp.json` components. OpenAgent
extensions are declared under `extensions.openagent` so packages stay portable
and unknown fields remain harmless to other hosts.

## Normalized descriptor

The Runtime exposes a typed descriptor rather than raw manifest JSON. Its
stable fields are `id`, `name`, `version`, `repository`, `path`, `capabilities`,
`commands`, `message_policies`, `skills`, `mcp_servers`, `automation_hooks`,
`sidebar_views`, `enabled`, `warnings`, and `error`. Update results are returned by
`check_updates`. IDs are the manifest name for portable packages and the
reserved builtin ID for product capabilities; child components use
`plugin:<plugin-id>:<component-id>`.

Runtime command descriptors carry an optional `plugin_id`; `/goal` and
`/graph` point to their matching builtin descriptor. `message_policies` lists
checkpoint or lifecycle message tags owned by the plugin and declares whether
each message is visible to the user and/or model. Portable packages use entries
shaped like `{ "tag": "notice", "user_visible": true, "model_visible": false }`.
The loader namespaces portable tags as `plugin:<plugin-id>:<tag>`, rejects
unknown fields and policies with no audience, and exposes the normalized policy
through the plugin descriptor. Only the Runtime can persist a checkpoint or
apply a policy, so a package cannot forge a builtin tag or bypass audience
projection.

`enabled` is the lifecycle gate for portable components. Missing persisted
entries default to `true` for compatibility; disabling a plugin removes its
Skills, MCP servers, and Automation Hooks from new Runtime assemblies. Builtin
switches retain their existing product settings through one resolver: Chat
Groups keeps the legacy `chat_groups_enabled` compatibility field, Cua uses
its reserved MCP entry, and Goal/Graph use the same `agent_plugins_enabled`
map. All Runtime and desktop entry points use this resolver, so a temporary
mismatch between legacy and normalized settings cannot expose one path after
the plugin is disabled.

Runtime hosts that need to emit a plugin message resolve its namespaced tag
through the installed-plugin policy resolver. The resolver checks the plugin
root and namespace before returning the audience rule; raw tags and tags owned
by another plugin are rejected. Builtin lifecycle tags use the same persisted
shape (`plugin:<builtin-id>:<tag>`): Goal, Graph, and Chat Groups materialize
their enum tags into `plugin_tags` and persist the resolved user/model audience.
On restore, older checkpoints are normalized before transcript or provider
projection, so frontend code does not need a builtin-tag allowlist.

Automation commands may return a structured lifecycle message such as
`{"message":"Approval required","tag":"approval"}`. The Runtime
namespaces the local tag to `plugin:<plugin-id>:<tag>`, verifies that the
manifest declares the tag, and persists the resolved audience in the
checkpoint record. `user_visible` messages are projected into the transcript;
`model_visible` messages are included in the next provider request. Plain text
hook output keeps the existing model-context behavior and is not persisted as a
plugin message.

Tagged output is delivered only through that durable plugin-message channel. It
never becomes a suffix on the tool result that triggered the hook, so a
structured tool result such as `{"invoked":true,"groupIds":[...]}` stays exactly
what the tool returned; consumers may therefore read a leading JSON value
without tolerating appended plugin text. Untagged plain-text output keeps the
existing inline model-context behavior at the hook site.

The Runtime resolves each hook's package-relative `command` to a contained
executable inside the plugin root and invokes that file. Plugin commands and
hooks are not expected to be shell fragments, so a plugin must not rely on shell
expansion, pipes, or quoting tricks in `command`.

The loader accepts a valid manifest even when one optional component is bad.
Manifest errors reject the package; a bad `skills/`, `mcp.json`, automation
entry, or sidebar entry disables only that component and records a diagnostic.
No plugin component may escape the resolved package root. Writable state is
always under `<OPENAGENT_HOME>/plugin-data/<plugin-id>/`.

## Capabilities

### Skills and MCP

Skills continue to use immediate child directories under `skills/` with a
conforming `SKILL.md`. MCP continues to use the portable `mcp.json` schema and
the existing `PLUGIN_ROOT`/`PLUGIN_DATA` expansion and transport restrictions.
The product registry exposes Cua Driver, Chat Groups, Goal Mode, and Graph Mode
as trusted builtin plugin descriptors. The same registration supplies their
capabilities, commands, tool ownership, message policies, and component ownership to the
Runtime. Their implementation remains owned by the Runtime or desktop host, so
they cannot be installed or uninstalled as portable packages. Cua Driver still
uses its verified resource, daemon ownership, fixed endpoint, and reserved MCP
lifecycle.

### Automation

Plugin hooks reuse the existing lifecycle event names and matcher/timeout
semantics. Each hook declares a package-relative `command`; IDs must be namespaced and hooks run with the owning plugin's
enablement and permission policy. A timeout, invalid response, or process error
is isolated to that hook and appears in plugin diagnostics; it cannot stop
ordinary Runtime finalization. Plugin hooks do not receive model context or
Inspector/trace data. Command execution requires an explicit host permission;
MCP-backed actions are preferred.

### Slash commands

Portable commands are declared in `plugin.json` under
`extensions.openagent.commands`:

```json
{
  "id": "summarize",
  "label": "Summarize",
  "description": "Summarize the current conversation",
  "argument": "required_text",
  "command": "bin/summarize.cmd",
  "timeout_secs": 30
}
```

The command is exposed as `/plugin-id:summarize`. `argument` is either `none`
or `required_text`; command IDs, labels, descriptions, package-relative paths,
and timeouts (`1` through `300` seconds) are validated before registration.
Unknown fields and invalid entries are skipped with a plugin diagnostic. A
disabled or invalid plugin contributes no commands. The catalog projection
resolves ownership through the builtin registry and the portable descriptor
owner instead of trusting a descriptor tag, and every host reads that
projection rather than caching its own list. Frontends re-read the catalog when
settings or the installed plugin set change, so disabling a plugin removes its
commands from the composer palette without an application restart.

When invoked, the Runtime starts the package-relative executable through the
same process boundary used by Automation Hooks. It writes one UTF-8 JSON
object to stdin containing `conversation_id`, `plugin_id`, `command`,
`argument`, and the original `input`. The executable must return a non-empty
UTF-8 prompt on stdout. Non-zero exit status, timeout, empty stdout, or a path
that resolves outside the installed plugin root fails the command without
starting a model run. The command catalog exposes labels and descriptions but
never package filesystem paths.

### Right-sidebar views

Sidebar view IDs are `plugin:<plugin-id>:<view-id>`. A view declares a title,
optional icon, package-relative entry, scope (`global`, `workspace`, or
`conversation`), and requested host capabilities. Supported capabilities are
`workspace`, `conversation`, `branch`, `files`, `locale`, and `theme`; the host
only includes data requested by the view. The host registers it beside the built-in
`status`, `files`, `terminal`, and `group` panels and persists selection with
the existing conversation/branch scope store.

The first host surface accepts UTF-8 HTML entries and runs them in an iframe
with `sandbox="allow-scripts"`. Third-party UI runs in an isolated plugin surface. The host sends only an
allowlisted panel context (workspace and opaque conversation/branch identity,
safe file-change summaries, locale, and theme) over a versioned postMessage
channel. The context is refreshed when the active workspace, branch, or theme
changes.
Plugins never receive transcript contents, prompts, model output, Inspector
records, trace payloads, or another plugin's data. UI failures unmount only the
affected view and leave the main conversation surface usable.

## Lifecycle and updates

The current host and SDK expose `list`, `read`, `install`, `check_updates`,
`update`, and `uninstall` as structured operations. Installation and update
copy into a staging directory, validate again, then atomically activate the
package. Updates select a GitHub HTTPS release archive with a verified
`sha256:` digest, reject oversized or unsafe archives, preserve `plugin-data`,
and restore the previous active package if replacement cannot be completed.
Startup also repairs an interrupted replacement by restoring a backup when the
active package is missing and removing stale staging directories.
Enable and disable remain lifecycle gates for mounted components.

Local directories are the first supported source. A manifest `repository` may
point to an HTTPS GitHub repository. `check_updates` reads its latest stable
release metadata, compares the tag with the installed version, and shows a
user-facing reminder including a verified archive candidate when one exists.
`update` is explicit: it downloads, validates, stages, and atomically activates
that candidate without executing it during validation.

## Built-in migration

Built-in capabilities use the same descriptor and registry with a trusted
`builtin` source. Chat Groups retains `chat_groups_enabled`; Goal and Graph
retain the `/goal` and `/graph` Runtime commands; their checkpoint message
policies remain persisted by the existing checkpoint store. Flow starts resolve
their kind through the builtin registry before checking enablement, so an
unknown flow cannot fall through to Goal execution. Existing user MCP,
Skills, and `automation_hooks` settings are
normalized without changing their persisted shapes.

Builtin tools are also owned by registry entries. The provider tool projection
removes tools whose owning builtin is disabled, and every tool call repeats the
same live check before mutating state. This keeps a stale Runtime tool server or
an in-flight model request from bypassing a settings toggle.

The command catalog shares that admission rule. `/goal` and `/graph` are gated
by their registry entry rather than by a descriptor tag, and every consumer
that rebuilds an advertised tool list mid-run applies the same plugin switch, so
a disabled capability cannot reappear in a later turn of an in-flight request.

## Verification

Plugin changes require focused loader/contract tests, command-boundary tests for
each new Tauri operation, and frontend contract tests for registration and
scope restoration. Visible sidebar changes require a real Tauri black-box
scenario in light/dark themes and Chinese/English. Run `bun run check:skills`
and `bun run check:docs` after documentation or routing changes.
