# OpenAgent plugin contract

Terminal lifecycle hooks receive an `event.phase` such as `interrupted`,
`final_completed`, `final_cancelled`, or `final_failed`, including turns resumed
after approval. Packages must wait for unresolved approval/input rather than
waking another turn. Hidden continuations cannot cancel outstanding approvals
or restart a user-cancelled run. A plugin's Stop hook owns its durable workflow
cancellation; the host does not interpret package-specific Goal state.

This document owns the OpenAgent-specific extension contract layered on the
portable Agent Plugins 1.0.0 package format. The portable root remains
`plugin.json`, with optional `skills/` and `mcp.json` components. OpenAgent
extensions are declared under `extensions.openagent` so packages stay portable
and unknown fields remain harmless to other hosts.

Language declarations, supported-language display, platform-aligned switching,
and official language coverage follow [the plugin i18n standard](i18n-standard.md),
which distinguishes requirements from the current implementation boundary.

## Normalized descriptor

### Protocol compatibility and Runtime synchronization

Package SemVer, portable schema 1.0.0, the desktop SDK protocol and the OpenAgent
plugin protocol are independent identities. Packages declare an inclusive
`extensions.openagent.compatibility.plugin_protocol` range, for example
`{ "min": 1, "max": 1 }`. Bounds are positive unsigned 32-bit integers;
unknown compatibility keys and malformed ranges reject the manifest. Missing
declarations retain the protocol-1 baseline. Incompatible installations preserve
package data and update provenance while contributing no executable components.

The optional `embedding.status` and `embedding.embed` Host Bridge operations
expose local Runtime inference under protocol 1. Follow
[embedding resources](../../openagent-embedding-resources/references/model-provenance.md#plugin-inference)
for detection, request bounds, model identity and resource ownership.

Release Runtime-version changes synchronize installed GitHub subscriptions in
the primary Runtime before plugin processes mount. Checks and downloads are
bounded; offline, incompatible and failed candidates preserve the installed
package and retry at the next startup. Debug builds retain explicit updates.
The derived `plugin-runtime-version.json` marker binds successful checks to the
executing Runtime binary SHA-256, package version and plugin protocol; deleting
it repeats synchronization. This also handles independently versioned Runtime
resources built from source with the same package version.

Publisher release notes advertise `plugin_protocol` inside an
`<!-- openagent-plugin <JSON> -->` marker. When latest is incompatible, checks
select the newest compatible stable candidate among the latest 100 releases.
The archive still passes complete manifest/protocol validation, digest checks
and name/version agreement before atomic replacement. No host-access grant or
plugin enablement setting is changed. Plugin data migrations remain package-owned.

Package authors determine versions and verified protocol ranges during the
change, following [plugin versioning](versioning.md). Pinned standard package
publication uses `scripts/plugin-release.mjs` and `plugin-releases.yml` to validate
and package those source identities without rewriting manifests. Every staged
package is tested before publication; unchanged source reuses an existing
release. The retained `openagent-plugin-releases.json` maps package versions to
source and protocol.
Configure `OPENAGENT_PLUGIN_RELEASE_TOKEN` with contents write access only to
the indexed standard-package repositories. Cross-repository SDK dispatch also
requires Actions write access on OpenAgent for its dispatcher App.

The Runtime exposes a typed descriptor rather than raw manifest JSON. Its
stable fields are `id`, `name`, `version`, `repository`, `path`, `capabilities`,
`commands`, `message_policies`, `skills`, `mcp_servers`,
`automation_hooks`, `sidebar_views`, `enabled`, `warnings`, and `error`. Update
results are returned by
`check_updates`. IDs are the manifest name for portable packages; a published
integration may reserve the same name for lifecycle migration, but it still
executes as an installed package. Child components use
`plugin:<plugin-id>:<component-id>`.

Runtime command descriptors carry an optional `plugin_id`; every command
contributed by an installed package is resolved through that owner. A
package's `message_policies` lists checkpoint or lifecycle message tags it
owns and declares whether each message is visible to the user and/or model.
Portable packages use entries shaped like `{ "tag": "notice",
"user_visible": true, "model_visible": false }`. The loader namespaces
portable tags as `plugin:<plugin-id>:<tag>`, rejects unknown fields and
policies with no audience, and exposes the normalized policy through the
plugin descriptor. Only the Runtime can persist a checkpoint or apply a
policy, so a package cannot forge another package's tag or bypass audience
projection.

There is no manifest field that binds a package to a Runtime implementation.
Every package uses the same process boundary and host capability bridge. The
package owns its domain state, tools, reducers, scheduling, recovery, and
completion rules while the Runtime supplies persistence, cancellation,
permissions, and Agent execution. A verified release is staged as an installed
package after the same manifest validation as any other plugin.

`enabled` is the lifecycle gate for portable components. Missing persisted
entries default to `true` for compatibility; disabling a plugin removes its
Skills, MCP servers, and Automation Hooks from new Runtime assemblies.
Product compatibility switches retain their existing settings through one
resolver: Chat Groups keeps the legacy `chat_groups_enabled` field, Cua uses
its reserved MCP entry, and installed packages use `agent_plugins_enabled`.
All Runtime and desktop entry points use this resolver, so a temporary
mismatch between legacy and normalized settings cannot expose one path after a
plugin is disabled.

Installed-plugin cards show a named enablement switch in the header. A package
requesting host access has a separate, always-visible permission row below the
header, with a visible label and wrapping explanation of the sandbox exemption.
Enablement and host authorization remain independent; enabling a package never
grants host access. Do not place both switches together as unlabeled controls or
repeat the same authorization warning in the card summary.

Installation results use compact, neutral text with a success/error icon and a
localized sentence naming the package, rather than a filled provider-status
banner. Completed and failed results can be dismissed independently from the
window-wide install queue and stay dismissed when Settings reopens. Running
tasks cannot be dismissed; their progress and duplicate-install guard survive
surface closure. Verify these controls with `test:blackbox:plugin-settings`.

Runtime hosts that need to emit a plugin message resolve its namespaced tag
through the installed-plugin policy resolver. The resolver checks the plugin
root and namespace before returning the audience rule; raw tags and tags owned
by another plugin are rejected. Older product lifecycle tags may still be
normalized when restoring checkpoints, but new package messages use the same
namespaced policy path as every other plugin. On restore, checkpoints are
normalized before transcript or provider projection, so frontend code does not
need a domain-specific tag allowlist.

Automation commands may return a structured lifecycle message such as
`{"message":"Approval required","tag":"approval"}`. The Runtime
namespaces the local tag to `plugin:<plugin-id>:<tag>`, verifies that the
manifest declares the tag, and persists the resolved audience in the
checkpoint record. `user_visible` messages are persisted as `user`-role plugin
records when model-facing; display-only notices use the common `ui` record.
The [conversation UI standard](conversation-ui.md) also supports built-in
components and plugin-declared inline documents. They are never treated as an
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
  under a recorded user-authorization reason; the host stops rather than starting
  a daemon whose managed policy cannot satisfy its declared capability.

The desktop host has a `PluginDaemonSupervisor` registry for declared long-lived
daemons. Enabled non-reserved daemon packages are discovered before MCP
connections are mounted, keyed by their validated plugin ID, and receive a
private `PLUGIN_DATA` working directory plus an optional
`OPENAGENT_PLUGIN_ENDPOINT`. The registry owns duplicate-start protection,
stdin lifetime pipes, socket readiness, bounded stop, forced reaping, stderr
draining, adapter resource ownership, and host-exit cleanup. The reserved Cua
Driver daemon uses the same registry after its adapter resolves endpoint
ownership and provisioning. A plugin cannot select another plugin's ID or
an arbitrary executable through this path. Daemons whose resolved policy is
managed are rejected until the host supplies a sandbox-aware transport adapter;
the host must never turn that rejection into an ambient unsandboxed spawn.
The host exposes only status and stop operations for plugin IDs; start is
automatic during Runtime bootstrap, so a plugin cannot manufacture an
unregistered child through an IPC call.

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
The runner rechecks containment and launches the resolved program and argv
directly; JavaScript entries use Node and Windows batch entries use system Cmd.
It never treats a package path as a shell fragment. User-authored shell automation keeps
its existing shell semantics and session policy.

### Host capability bridge

Every enabled installed plugin receives the same authenticated loopback host
bridge environment: `OPENAGENT_PLUGIN_HOST_URL`,
`OPENAGENT_PLUGIN_HOST_TOKEN`, and `OPENAGENT_PLUGIN_ID`. The bridge is a
capability module, not a builtin-specific adapter. Its stable operations are:

- `conversation.create`, `conversation.state`, `conversation.children`,
  `conversation.update`, `conversation.cancel`, and `conversation.delete`;
- `branch.create`, `branch.list`, `branch.head.set`, and `branch.active.set`;
- `conversation.flow.set` for explicitly persisting an opaque package
  projection on a selected conversation branch;
- `agent.submit` and `agent.wake` (the explicit wake-up spelling of the same
  agent submission boundary);
- `roles.list`; and
- `event.emit`.

The bearer token identifies the caller, so `plugin_id` is injected by the
host when omitted and a supplied value must match the token. Agent requests
accept both the canonical snake_case bridge fields (`conv_id`, `branch_id`,
`parent_checkpoint_id`) and the SDK's camelCase aliases. `agent.wake` waits by
default and returns the accepted outcome plus current conversation state;
`wait: false` schedules the wake and returns `{ "accepted": true }`.
When `branch_id` is supplied and `parent_checkpoint_id` is omitted or `null`,
the host resolves that branch's current head immediately before submission,
including after busy-run retries; this is the safe continuation form for
package schedulers.

Events other than the shared lifecycle notifications are automatically
namespaced as `plugin:<plugin-id>:<event>`, preventing one package from
impersonating another. The host applies the same operation policy to every
package; adding a plugin does not require a new Runtime `match` arm. Plugins
own their state machines, graph or group reducers, and wake scheduling in
their own process while the host owns persistence, permissions, cancellation,
and the canonical agent submission path.

Requests are JSON objects of the form
`{ "operation": "agent.wake", "args": { ... } }`. The following argument
fields form the stable bridge contract (all IDs are strings):

- `conversation.create`: `title`, optional `workspace`, `parent_conv_id`, and
  `role_id`; returns `conv_id` and `branch_id`.
- `conversation.state`: `conv_id` and optional `branch_id`; returns conversation
  metadata, the selected branch/checkpoint, phase, and projected
  user/assistant messages. Supplying `branch_id` makes that branch authoritative
  even when another branch is active in the desktop.
- `conversation.children`: `parent_conv_id` and optional `workspace`.
- `conversation.update`: `conv_id` plus optional `title`, `title_source`,
  `pinned`, and `updated_at`.
- `conversation.cancel` and `conversation.delete`: `conv_id`.
- `branch.create`: `conv_id` plus optional `id`, `parent_branch_id`,
  `forked_from_checkpoint_id`, and `forked_from_message_id`; returns the new
  branch.
- `branch.list`: `conv_id`; `branch.head.set`: `branch_id` and
  `checkpoint_id`; `branch.active.set`: `conv_id` plus either `branch_id`
  (the host activates that branch's current head) or `checkpoint_id` (the
  checkpoint must belong to the conversation). A branch head is always
  checked against its conversation before it is written, so a package cannot
  accidentally attach a sibling conversation's checkpoint.
- `conversation.flow.set`: `conv_id`, `branch_id`, and a package projection
  with `{ "kind": "plugin", "state": { "plugin_id": "<authenticated-plugin>", ... } }`.
  The host stores the projection on the selected branch's current checkpoint
  when the branch is idle (creating the branch's first empty checkpoint when
  needed). If the branch is running, it merges the projection into that run's
  snapshot so the final message checkpoint persists it atomically. The
  operation never interprets package fields or changes a sibling branch's
  active tip.
- `agent.submit` and `agent.wake`: either the request fields at the top level
  or under `request`: `conv_id`, `text`, optional `parent_checkpoint_id`,
  `branch_id`, `attachments`, `contexts`, `model_binding`,
  `user_message_id`, and `assistant_message_id`. Both operations also accept
  optional `hidden` and a package-owned `flow` projection with
  `{ "kind": "plugin", "state": { ... } }`; the projection must identify the
  authenticated package and is carried opaquely for display. `agent.wake`
  additionally accepts `wait`; `false` schedules the turn and returns
  immediately.
- `roles.list`: optional `workspace`.
- `event.emit`: `name` and optional JSON `payload`.

Successful calls return `{ "ok": true, "result": ... }`; validation or
execution failures return `{ "ok": false, "error": "..." }`. The bridge
never exposes provider payloads, Inspector data, or another plugin's token.

Automation hooks receive the same authenticated bridge environment as MCP
servers, plus `PLUGIN_ROOT` and `PLUGIN_DATA`. Hook stdin
contains those routing fields inside an `event` object, for example
`{ "hook_event_name": "stop", "cwd": "...", "event": { "conversation_id": "...", "branch_id": "...", "run_id": "...", "execution_id": "...", "turn": 1 } }`.

`execution_id` is allocated once per Runtime execution, remains stable across
that execution's hooks and changes for continuation/resume. Use it for Stop
deduplication; `run_id` is a correlation identifier and can equal the conversation
ID across executions. Neither identity carries model data.
`parent_conv_id` and `role_id` may also appear when the Runtime knows them.
These are opaque routing IDs; hooks use the bridge for Agent operations and
keep package state under `PLUGIN_DATA`.

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
The Runtime registry contains only Runtime-owned capabilities such as
Multi-Agent V2; its six tools and child-conversation registry are owned
directly by Runtime, and its dedicated `multi_agent_v2.enabled` setting is not
a plugin lifecycle switch. Goal, Graph, Chat Groups, and Cua Driver are loaded
from installed package manifests and use the same ordinary package boundary.
They do not register a domain implementation with Runtime. Cua Driver's daemon
is resolved from its installed package and supervised through the same host
daemon boundary as any other plugin; real computer access is a generic
per-plugin authorization.

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
supplies the `resource_metadata` URL and requested scope, and that URL outranks
the derived locations, which are tried at the standardized well-known placement
before the appended one. The protected resource's advertised `resource` becomes
the canonical RFC 8707 audience (a conflicting configured resource is
rejected). PKCE `S256`, secure endpoints, issuer agreement, and RFC 9207 `iss`
validation on the callback are enforced; Client ID Metadata Documents are not
implemented and fail with a diagnostic. A connection test reports whether OAuth
is usable for the endpoint, and the settings surface offers authorization only
where a flow can complete, so an endpoint that demands credentials without
serving metadata is explained instead of opened in a browser. The local plugin
lifecycle supports package installation,
enable/disable, uninstall, and verified GitHub release updates. A hosted
OpenAI marketplace listing is a separate service and is not claimed by the
local package loader.

### Dynamic MCP tool leases

The authenticated bridge accepts `mcp.mount` with a raw server key from the
caller's `mcp.json`, `mode` (`direct`/`relay`) and integer `ttl_secs` in 1..86400;
`mcp.unmount` takes `server`; `mcp.status` takes an optional `server`. Responses
carry version 1, `applies_at: next_tool_assembly`, normalized server IDs,
effective mode and lease state. Mounting validates installed ownership and live
enablement, and cannot register an executable/endpoint or grant host access.
User per-plugin mode overrides win over lease requests and manifest defaults.

Direct/Relay changes appear in the next turn's assembled catalog. Expiry and
revocation also reject existing proxies and app/native calls. Relay checkpoint
restoration cannot reopen an expired lease. Leases survive connection refresh
within a Runtime process; restart loses them. Disable/uninstall revoke them and
re-enablement uses manifest defaults. Tool leases leave the transport connected;
packages own periodic renewal and cancellation through commands, hooks or a
supervised daemon, retaining a control path when their own tools are leased.

`runtime.permissions` returns version 1 and the live permission profile to the
authenticated caller. Plugin development harnesses use it to configure an
isolated test Runtime with the same policy through the normal settings operation.
Missing sandbox provisioning remains an explicit failed test prerequisite.

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

The command is exposed as `/plugin-id:summarize`. `argument` is `none`,
`required_text`, or `optional_text`; optional text admits bare and parameterized
input without host-owned subcommand parsing. Command IDs, labels, descriptions, package-relative paths,
and timeouts (`1` through `300` seconds) are validated before registration.
Unknown fields and invalid entries are skipped with a plugin diagnostic. A
disabled or invalid plugin contributes no commands. The catalog projection
resolves ownership through the validated package descriptor and plugin ID; a
registry entry supplies lifecycle metadata only. Every host reads that
projection rather than caching its own list. Frontends re-read the catalog when
settings or the installed plugin set change, so disabling a plugin removes its
commands from the composer palette without an application restart.

When invoked, the Runtime starts the package-relative executable under the
plugin process policy the package loader resolved for it, not the plain session
profile Automation Hooks inherit, so the command needs an active workspace and
gains only its own `PLUGIN_DATA` write access. It writes one UTF-8 JSON
object to stdin containing `conversation_id`, the selected `branch_id` (or
`null` for a root turn), `plugin_id`, `command`, `argument`, and the original
`input`. The executable must return a non-empty
UTF-8 prompt on stdout. Non-zero exit status, timeout, empty stdout, or a path
that resolves outside the installed plugin root fails the command without
starting a model run. The command catalog exposes labels and descriptions but
never package filesystem paths.

### Package-owned orchestration

A package that needs multi-turn work owns its complete state machine in its own process. It uses an ordinary plugin command to start a turn, its MCP tools or daemon to persist domain state, and the common host bridge to create conversations, create branches, update opaque flow projections, submit or wake Agents, cancel descendants, list roles, and emit progress. The Runtime does not parse package state, run a package loop, apply an iteration limit, or register Goal, Graph, or Group implementations.

The optional checkpoint projection and plugin-flow-updated event are opaque display data. The host validates only package identity and containment, then carries the projection through the generic checkpoint/event path. A package owns its schema, status vocabulary, reducer, recovery, scheduling, and completion rule. Lifecycle projections and checkpoint events include the owning `branch_id`; the frontend keeps their transient overlay isolated by conversation and branch.

### Right-sidebar views

Sidebar view IDs are `plugin:<plugin-id>:<view-id>`. A view declares a title,
optional icon, package-relative entry, scope (`global`, `workspace`, or
`conversation`), and requested host capabilities. Supported capabilities are
`workspace`, `conversation`, `branch`, `files`, `locale`, and `theme`; the host
only includes data requested by the view. The host registers it beside the built-in
`status`, `files`, and `terminal` panels and persists selection with
the existing conversation/branch scope store.

The host's navigation owns the visible sidebar view title. Plugin HTML starts
with its content or actions instead of repeating the manifest view title as an
introductory heading; distinct content section headings are allowed. The host
keeps localized region and iframe names for accessibility. Review the composed
host/plugin surface under the design system's
[embedded-surface title rule](../../openagent-design-system/references/layout.md#embedded-surface-titles).

The first host surface accepts UTF-8 HTML entries and runs them in an iframe
with `sandbox="allow-scripts"`. Third-party UI runs in an isolated plugin surface. The host sends only an
allowlisted panel context (workspace and opaque conversation/branch identity,
safe file-change summaries, locale, and theme) over a versioned postMessage
channel. The context is refreshed when the active workspace, branch, locale, or theme
changes.
Plugins never receive transcript contents, prompts, model output, Inspector
records, trace payloads, or another plugin's data. UI failures unmount only the
affected view and leave the main conversation surface usable.

Workspace-capable sidebar frames can use the optional version-1 package tool
bridge documented in the [sidebar owner](../../openagent-chat-frontend/references/plugin-sidebar.md#package-tool-requests).
Detect `tool_calls` in context before using it. This uses the existing typed
plugin tool operation and preserves Runtime permissions and package ownership;
it grants no direct network, token, transcript, or filesystem access.

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
Update and uninstall await the target package's MCP process shutdown before
changing its files, with concurrent MCP refresh excluded until the file operation
finishes. Failed operations reconnect the package that remains installed; updates
reload components from the newly activated package on success. Desktop hosts stop
their own package daemons before requesting replacement or removal.

Direct installs use a local directory; a Marketplace entry can additionally be
`local`, `url`, `git-subdir`, or `npm`, and each is staged and validated through
the same activation path. A manifest `repository` may
point to an HTTPS GitHub repository. `check_updates` reads its latest stable
release metadata, compares the tag with the installed version, and shows a
user-facing reminder including a verified archive candidate when one exists.
It runs silently whenever the plugin directory is loaded, and the Plugins tab
additionally offers an explicit Check for updates action that re-runs it on
demand and reports the outcome: the available-update count, an all-up-to-date
statement, or the plugins whose release metadata could not be read, each named
with the reason it gave.
A silent background failure only logs; a failure the user asked for is always
stated, and a per-plugin error never leaves the button claiming the plugins are
current. `update` is explicit: it downloads, validates, stages, and atomically
activates that candidate without executing it during validation.

Release metadata comes from the GitHub REST API, which without credentials
allows only 60 requests per hour for the whole originating IP — a quota every
other program on that connection also spends. A check therefore does not
request per plugin every time. It answers from
`<OPENAGENT_HOME>/plugin-update-cache.json`, a derived file keyed by
`owner/repo`, while an entry is inside a ten-minute freshness window; past that
window each repository is revalidated conditionally with the `ETag` it stored,
so a `304` reuses the cached release and only changed or never-validated
repositories pay for new metadata. One check runs at a time, and the cache is
merged under a file lock and replaced atomically, so concurrent windows share
one result instead of overwriting each other. The explicit Check for updates
action respects the same window and labels a fully cached result as such: a
check that makes no request cannot report a rate limit it never met.

Failures are reported as the condition that caused them, not as broken
packages. Each plugin entry carries an error kind — `rate_limited`,
`network_failed`, `repository_unsupported`, or
`release_unavailable` — and the report envelope carries one overall status that
outranks that per-plugin detail, because quota can run out mid-check and leave
a mixed result. An exhausted quota or an unreachable network is therefore
stated once at the top, with the reset time when GitHub supplies
one, rather than counted as plugins that failed to check; only
`repository_unsupported` and `release_unavailable` describe the plugin itself.
An incomplete check names the affected plugins and states each reason from its
error kind, so the summary is actionable without expanding a row; the raw
diagnostic from the check stays on that plugin's own row as its detail, and a
row whose error kind is unknown falls back to it.
A refresh that fails past the freshness window keeps the last known release
marked `stale` rather than discarding it, for at most seven days, so a badge
does not flicker on a transient error — the envelope already states the global
condition, so a stale value is never shown as current. `update` re-resolves
metadata before installing and refuses to activate from a stale or otherwise
unconfirmable release. Release metadata and archive downloads use public
endpoints and never carry a user credential.

## Built-in capabilities and packages

Published product packages use the same descriptor, process policy, and host
bridge as third-party packages. Runtime registry entries identify only
capabilities that are implemented inside Runtime itself, such as Multi-Agent
V2. A package never registers a hidden command, graph reducer, tool
implementation, or domain state with that registry. It owns those parts under
its `PLUGIN_DATA` directory and calls the generic conversation, branch, agent,
role, flow, and event operations when it needs host services. Older Goal/Graph
checkpoints remain readable as opaque legacy payloads, while new package
projections use the generic checkpoint shape. Existing user MCP, Skills, and
`automation_hooks` settings are normalized without changing their persisted
shapes.

Runtime-owned tools are identified by registry entries. The provider tool
projection removes tools whose owning builtin is disabled, and every tool call
repeats the same live check before mutating state. Package MCP tools are loaded
from the package descriptor and are never duplicated in the Runtime tool
registry, so a stale Runtime tool server cannot become a second domain owner.

The command catalog shares that admission rule. A package contributes its own
command exactly once, and every consumer that rebuilds an advertised
catalog mid-run applies the same plugin switch, so a disabled capability cannot
reappear in a later turn of an in-flight request.

## Verification

Plugin changes require focused loader/contract tests, command-boundary tests for
each new Tauri operation, and frontend contract tests for registration and
scope restoration. Visible sidebar changes require a real Tauri black-box
scenario in light/dark themes and Chinese/English. Run `bun run check:skills`
and `bun run check:docs` after documentation or routing changes.
