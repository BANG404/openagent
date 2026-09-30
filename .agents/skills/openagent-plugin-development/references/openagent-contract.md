# OpenAgent plugin contract

This document owns the OpenAgent-specific extension contract layered on the
portable Agent Plugins 1.0.0 package format. The portable root remains
`plugin.json`, with optional `skills/` and `mcp.json` components. OpenAgent
extensions are declared under `extensions.openagent` so packages stay portable
and unknown fields remain harmless to other hosts.

## Normalized descriptor

The Runtime exposes a typed descriptor rather than raw manifest JSON. Its
stable fields are `id`, `name`, `version`, `repository`, `path`, `capabilities`,
`commands`, `flows`, `message_policies`, `skills`, `mcp_servers`,
`automation_hooks`, `sidebar_views`, `enabled`, `warnings`, and `error`. Update
results are returned by
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

`extensions.openagent.runtime` optionally binds a standard package to one
trusted product capability: `chat-groups`, `goal`, `graph`, or `cua-driver`.
The Runtime accepts only the matching builtin identity and never treats this
field as a general permission grant. Builtin subscriptions use the package's
GitHub `repository` as their update source; a verified release is staged as an
installed package. When that package declares the capability's Flow or MCP
names, its implementation is authoritative and the Runtime supplies only
generic loop, cancellation, checkpoint, and permission mechanics. The registry
remains the compatibility alias and lifecycle boundary while older
installations transition away from the local implementation.

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
checkpoint record. `user_visible` messages are persisted as `user`-role plugin
records and projected by the common frontend plugin-message component, which
labels the owning plugin from the namespace; they are never treated as an
authored user prompt. `model_visible` messages are included in the next
provider request. Plain text hook output keeps the existing model-context
behavior and is not persisted as a plugin message.

Plugins may also declare one `extensions.openagent.daemon` with a contained
command, string `args` and `capabilities` arrays, and `stdio` or `socket`
transport. The Runtime validates and reports this descriptor. The host owns
supervision, permissions, endpoint selection, and shutdown; a daemon can be
paired with an MCP client declared in `mcp.json`. The Runtime resolves the
daemon's process policy alongside the descriptor and the host consumes it at its
spawn point, so a daemon starts either confined by the session-derived policy or
under a recorded exemption reason; the host stops rather than starting a daemon
whose resolved policy is managed while the topology requires it unconfined.

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
as trusted plugin descriptors. Each capability has a standard package repository
and can receive a verified GitHub package overlay. The registration still
supplies trusted capabilities, commands, tool ownership, message policies, and
component ownership to the Runtime. Cua Driver's daemon is resolved from its
installed package and supervised through the same host daemon boundary as any
other plugin; its reserved MCP entry remains the client connection. It is also
the one reserved process exemption: the Runtime resolves that identity to an
unmanaged policy with a fixed product reason, and the host records the reason
when it starts the daemon instead of starting it unconfined by default.

### MCP Apps UI

OpenAgent supports the portable MCP Apps UI contract for MCP tools that declare
`_meta.ui.resourceUri`; `_meta["ui/resourceUri"]` and
`_meta["openai/outputTemplate"]` are accepted compatibility aliases. The host
reads `ui://` resources through `resources/read`, accepts only
`text/html;profile=mcp-app`, enforces a 4 MiB resource limit, and renders the
HTML in a sandboxed iframe. The iframe bridge implements the MCP Apps
initialization handshake with `hostCapabilities` and `hostContext`, tool
input/result notifications, `tools/call`, `resources/read`, `ui/open-link`,
`ui/request-display-mode` for inline/fullscreen, `ui/message`,
`ui/update-model-context`, teardown, ping, host-context changes, and
size-change notifications. Resource CSP and permission metadata are applied to
the iframe, and tools with `visibility: ["app"]` are excluded from the model's
tool catalog while remaining callable by the active app.

The host also provides the documented `window.openai` compatibility extensions:
`toolInput`, `toolOutput`, `toolResponseMetadata`, `callTool`,
`sendFollowUpMessage`, `widgetState`, `setWidgetState`, `uploadFile`,
`selectFiles`, `getFileDownloadUrl`, `requestDisplayMode`, `requestModal`,
`requestClose`, `notifyIntrinsicHeight`, `openExternal`, `setOpenInAppUrl`, and
`requestCheckout`. Checkout is an explicit confirmation boundary: the host
shows the session the component supplied and, only after the user confirms,
calls the same server's `complete_checkout` tool with that session and returns
its result. OpenAgent never collects payment credentials, never substitutes for
the merchant's payment provider, and never treats component-supplied totals as
authoritative — the server owns prices and order status, so it must re-validate
what it receives. The standard's hosted payment sheet is a private beta and is
not implemented; apps that need it must fall back to the external,
merchant-hosted flow. Apps must still feature-detect optional APIs and provide
a text or link fallback.

MCP HTTP connectors support OAuth 2.1 discovery, PKCE S256, loopback
callbacks, public dynamic registration, refresh tokens, and restricted local
token storage. Discovery is challenge-driven: a 401 `WWW-Authenticate` header
supplies the `resource_metadata` URL and requested scope, and the protected
resource's advertised `resource` becomes the canonical RFC 8707 audience (a
conflicting configured resource is rejected). PKCE `S256`, secure endpoints,
issuer agreement, and RFC 9207 `iss` validation on the callback are enforced;
Client ID Metadata Documents are not implemented and fail with a diagnostic. The local plugin lifecycle supports package installation,
enable/disable, uninstall, and verified GitHub release updates. A hosted
OpenAI marketplace listing is a separate service and is not claimed by the
local package loader.

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

When invoked, the Runtime starts the package-relative executable under the
plugin process policy the package loader resolved for it, not the plain session
profile Automation Hooks inherit, so the command needs an active workspace and
gains only its own `PLUGIN_DATA` write access. It writes one UTF-8 JSON
object to stdin containing `conversation_id`, `plugin_id`, `command`,
`argument`, and the original `input`. The executable must return a non-empty
UTF-8 prompt on stdout. Non-zero exit status, timeout, empty stdout, or a path
that resolves outside the installed plugin root fails the command without
starting a model run. The command catalog exposes labels and descriptions but
never package filesystem paths.

### Flows

A flow is a package-owned autonomous loop. The Runtime owns the loop mechanics
— turn dispatch, cancellation, the iteration limit, and checkpoint
continuation — and the package owns every decision inside it. Flows are
declared in `plugin.json` under `extensions.openagent.flows`:

```json
{
  "id": "goal",
  "label": "Goal",
  "description": "Work an objective to completion",
  "argument": "required_text",
  "step": "bin/goal-step.mjs",
  "timeout_secs": 60,
  "max_iterations": 50
}
```

The flow is exposed as `/plugin-id:goal`. `argument` is `none` or
`required_text`; `step` is a package-relative executable; `timeout_secs` is `1`
through `300`; `max_iterations` is `1` through `100`; and `max_iterations`
defaults to `100`. Validation matches portable commands: unknown fields and
invalid entries are skipped with a diagnostic, a disabled or invalid package
contributes no flows, and no flow's step may resolve outside the package root.
A flow whose id repeats a command id on the same package is rejected in favor of
the command.

The Runtime starts the step under the package's own process policy, so a flow
needs an active workspace and gains only its own `PLUGIN_DATA` write access. The
same confinement applies to the package's MCP servers, and both receive
`PLUGIN_ROOT` and `PLUGIN_DATA` from the trusted loader, so a package keeps one
state directory across its step and its tools. The Runtime writes one UTF-8 JSON
object to the step's stdin and reads one back per iteration:

```json
{
  "conversation_id": "…",
  "plugin_id": "goal",
  "flow_id": "plugin:goal:goal",
  "iteration": 1,
  "argument": "ship the release",
  "input": "/goal ship the release",
  "last_output": ""
}
```

`iteration` counts from `1`, `last_output` is the previous turn's persisted
assistant response (empty on the first iteration), and `conversation_id` may
change if the Runtime moved the run to a continuation conversation. `flow_id` is
the flow's namespaced catalog id, so the step receives its own identity rather
than a bare manifest id; `plugin_id` is the installed package name. The step
returns the prompt for the next turn, whether the flow is complete, and
optionally the display projection of its own state:

```json
{
  "prompt": "The goal is still active. Current state: …",
  "done": false,
  "state": {
    "title": "Ship the release",
    "status": "running",
    "items": [
      { "id": "1", "label": "Cut the tag", "status": "completed", "detail": "v1.2.0" }
    ],
    "summary": null
  }
}
```

The Runtime interprets none of this beyond `prompt` and `done`: the package owns
its state schema, its status vocabulary, and its completion rule. The optional
`state` object carries only what the package chooses to show. The Runtime stamps
its own `plugin_id` and `flow_id` onto that projection, persists it in the
conversation checkpoint, and emits it as a `plugin` kind on the flow event, so
the UI renders it generically and cannot be made to attribute a flow to another
package. The right-sidebar status panel shows the projection with no field of
its own: the heading is the `label` the installed package declared for that
namespaced flow, the subheading is the projection's `title`, the list is its
`items`, and a status token the host has no translation for is shown verbatim. A step that returns an empty prompt, invalid JSON, a non-zero exit
status, or times out fails the flow without starting another turn; the loop also
stops when the turn is cancelled or interrupted, or when `max_iterations` is
reached. Untrusted package output never reaches the transcript as a user
message: only the Runtime's own continuation prompt is persisted as the hidden
user record.

`done` is the package's report on the state its previous turn left behind, so
the Runtime ends the flow before spending a turn on a prompt that could only
wind down. The first iteration always runs, because a flow must produce at least
one turn; from the second iteration on, a step that reports `done` ends the flow
instead of supplying its next prompt.

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

Direct installs use a local directory; a Marketplace entry can additionally be
`local`, `url`, `git-subdir`, or `npm`, and each is staged and validated through
the same activation path. A manifest `repository` may
point to an HTTPS GitHub repository. `check_updates` reads its latest stable
release metadata, compares the tag with the installed version, and shows a
user-facing reminder including a verified archive candidate when one exists.
`update` is explicit: it downloads, validates, stages, and atomically activates
that candidate without executing it during validation.

## Built-in migration

Built-in capabilities use the same descriptor and registry with a trusted
`builtin` source. Chat Groups retains `chat_groups_enabled`; Goal and Graph
retain the `/goal` and `/graph` product aliases, but an installed runtime-bound
package owns the matching standard Flow and MCP tools. The Runtime's generic
flow runner carries only cancellation, checkpoint continuation, and the
package's display projection. Their checkpoint message policies remain
persisted by the existing checkpoint store. Existing user MCP, Skills, and
`automation_hooks` settings are normalized without changing their persisted
shapes. The local Goal/Graph runner remains only as a compatibility fallback
while the published packages are installed and activated by default.

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
