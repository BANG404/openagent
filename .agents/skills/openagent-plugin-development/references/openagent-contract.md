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
switches retain their existing product settings: Chat Groups uses
`chat_groups_enabled`, Cua uses its reserved MCP entry, and Goal/Graph use the
same `agent_plugins_enabled` map.

Runtime hosts that need to emit a plugin message resolve its namespaced tag
through the installed-plugin policy resolver. The resolver checks the plugin
root and namespace before returning the audience rule; raw tags and tags owned
by another plugin are rejected.

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
capabilities, commands, message policies, and component ownership to the
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

### Right-sidebar views

Sidebar view IDs are `plugin:<plugin-id>:<view-id>`. A view declares a title,
icon, package-relative entry, scope (`global`, `workspace`, or `conversation`),
and requested host capabilities. The host registers it beside the built-in
`status`, `files`, `terminal`, and `group` panels and persists selection with
the existing conversation/branch scope store.

The first host surface accepts UTF-8 HTML entries and runs them in an iframe
with `sandbox="allow-scripts"`. Third-party UI runs in an isolated plugin surface. The host sends only an
allowlisted panel context (workspace and opaque conversation/branch identity,
safe file-change summaries, and plugin state) over a versioned RPC channel.
Plugins never receive transcript contents, prompts, model output, Inspector
records, trace payloads, or another plugin's data. UI failures unmount only the
affected view and leave the main conversation surface usable.

## Lifecycle and updates

The current host and SDK expose `list`, `read`, `install`, `check_updates`, and
`uninstall` as structured operations. Installation copies into a staging
directory, validates again, then atomically activates the package. Enable,
disable, rollback, and replacement activation remain reserved for a later
package lifecycle revision.

Local directories are the first supported source. A manifest `repository` may
point to an HTTPS GitHub repository. `check_updates` reads its latest stable
release metadata, compares the tag with the installed version, and shows a
user-facing reminder. The check never downloads, activates, or starts new
plugin code.

## Built-in migration

Built-in capabilities use the same descriptor and registry with a trusted
`builtin` source. Chat Groups retains `chat_groups_enabled`; Goal and Graph
retain the `/goal` and `/graph` Runtime commands; their checkpoint message
policies remain persisted by the existing checkpoint store. Existing user MCP,
Skills, and `automation_hooks` settings are
normalized without changing their persisted shapes.

## Verification

Plugin changes require focused loader/contract tests, command-boundary tests for
each new Tauri operation, and frontend contract tests for registration and
scope restoration. Visible sidebar changes require a real Tauri black-box
scenario in light/dark themes and Chinese/English. Run `bun run check:skills`
and `bun run check:docs` after documentation or routing changes.
