# Agent Plugins

## OpenAI plugin compatibility

OpenAgent accepts the portable Agent Plugins 1.0 package used by OpenAI and
also reads the Codex compatibility layout emitted by the OpenAI plugin creator:

```text
plugin-root/
  plugin.json                 # portable entry point (preferred)
  mcp.json                    # portable MCP config
  .codex-plugin/plugin.json   # compatibility overlay when no OpenAI extension is inline
  .mcp.json                   # legacy MCP config referenced by the overlay
  .app.json                   # registered OpenAI connector mappings
  hooks/hooks.json            # optional OpenAI lifecycle hooks
```

The portable manifest keeps `name`, `version`, and other identity fields at the
root. OpenAI presentation, connector mappings, and hook paths belong in
`extensions.com.openai`. When that object is present it is authoritative over
`.codex-plugin/plugin.json`; OpenAgent does not merge the two. If the portable
manifest has no inline OpenAI extension, the overlay is used. A package with
only `.codex-plugin/plugin.json` is also accepted for compatibility.

Portable packages always prefer root `mcp.json`. Legacy `.mcp.json` accepts the
OpenAI examples' `type: "http"` alias and preserves the OAuth discovery hints
described below after validating the HTTPS endpoint. Hook commands are
loaded from `hooks/hooks.json` (or the configured relative path) only when the
command resolves to a file under the installed package through
`${PLUGIN_ROOT}`. Connector IDs in `.app.json` are presentation metadata; the
MCP endpoint remains owned by the package MCP configuration.

OpenAgent can load portable [Agent Plugins](https://agent-plugins.org/) version
1.0.0 packages whose root contains `plugin.json`. Validated packages are
installed under the active `OPENAGENT_HOME`; the original folder is not used at
runtime. The desktop Integrations settings surface can install a local folder,
refresh installed packages, enable or disable them, uninstall third-party
packages, and apply verified GitHub release updates.

An update is offered when the published version outranks the installed one. When
both parse as SemVer (after an optional leading `v`) precedence follows the
specification: a release outranks its own prerelease, prerelease identifiers
compare numerically and then by ASCII, and build metadata is ignored.
`version` is free-form in the portable format and is never grounds for rejecting
a package, so a value that does not parse falls back to comparing numeric
components left to right, padded with zeros. Publish increments that SemVer
understands.

`homepage` and `license` are manifest strings from the validated manifest, and
the installed plugin card shows them as provenance beside the package's
description. `author` and `keywords` are validated the same way and carried to
clients without a surface of their own. None of them is an authority: the
Runtime never reads them to decide what a package contains or may do, and
`repository` is the only descriptive field that drives behavior, because it is
the subscription the verified release updater follows. That subscription is
polled through a cached, quota-aware check, not one request per plugin per
load; `openagent-contract.md` owns that lifecycle.

### Integration inventory and provenance

Integrations → MCP lists configured servers and installed packages' MCP
contributions with separate identities. Package rows show the owning plugin and
use its existing configuration/OAuth and lifecycle controls, never an editable
copy of package endpoints. Channel and MCP detail source links open Installed
plugins and expand the exact owner card, including disabled packages.

Integrations → Skills browses the Runtime's `list_skills` inventory: global,
current workspace, and enabled plugin skills. It shows name, description, scope,
Runtime-resolved directory and read-only SKILL.md content, with search and
refresh. The source Select combines all/global/workspace/plugin filtering with
text search; selection follows the filtered list and clears when no rows match.
Each collection row shows its description beneath its name and retains source
provenance separately. Visible Windows drive and UNC paths omit the verbatim
namespace prefix; retain the original Runtime path for identity, reads and opens.
Open local directory passes that exact directory through the existing
SDK desktop path capability; failures remain visible and retryable. Never infer
skill paths from manifest names. The selected plugin card also lists its skill
metadata and resolves directory actions by plugin scope and skill name. Disabled
or unavailable skills keep their metadata, without fabricating a directory.
Keep the native separator when appending SKILL.md: Windows verbatim package
paths (`\\?\...`) reject appended forward slashes.
Loading reserves the list layout; discovery and content errors have distinct
feedback. Workspace changes and unmount retire pending results. Content is
plain text and does not load or execute package instructions in the WebView.
Inventory row identity and selection use scope together with directory: a home
workspace can expose the exact same directory as both global and workspace
skills. Keep both provenance entries independently selectable; a path alone
must not key the list or resolve the selected detail.

Run `bun run test:blackbox:integration-inventory` against the isolated
`integration-provenance` instance and explicit Pilot socket. It covers source
navigation, same-named package MCP servers, plugin and workspace skill metadata,
content, source filters combined with search, description rows, display paths,
plugin/Skills menu shortcuts, overlapping global/workspace directory selection and refresh,
directory opening and failure, disablement and uninstall in
light/dark and Chinese/English. Global skills use the same inventory projection;
fixtures must never write to the user's global skill directory.

### Theme and integration package types

`extensions.openagent.type` declares `agent` (the default), `theme`, or
`integration`, independently of the discovery `category`. Invalid IDs reject
the manifest. These types use the ordinary installation, update, enablement,
and removal lifecycle and grant no additional process permissions.

A theme declares `extensions.openagent.theme` with `version: 1` and custom
property maps `tokens`, `light`, and `dark`. Common tokens apply first, then the
resolved light/dark map. For example:

```json
{
  "extensions": {
    "openagent": {
      "type": "theme",
      "compatibility": {
        "plugin_protocol": { "min": 1, "max": 1 },
        "features": ["theme-v1"]
      },
      "theme": {
        "version": 1,
        "tokens": { "--radius": "20px", "--plugin-card-radius": "18px" },
        "light": {
          "--primary": "#663399",
          "--primary-foreground": "#ffffff",
          "--background": "#fffaf5",
          "--card": "#fffaf5"
        },
        "dark": {
          "--primary": "#cc99ff",
          "--primary-foreground": "#211b29",
          "--background": "#211b29",
          "--card": "#211b29"
        }
      }
    }
  }
}
```

Theme maps contain 1–256 total entries. Keys are CSS custom properties starting
with `--` followed by a lowercase letter, lowercase letters/digits/hyphens,
and at most 80 characters after the prefix. Values are nonempty, at most 512
bytes, and cannot contain control characters, declaration separators, braces,
markup, escapes, comments, `url(`, `expression(`, or `!important`. A theme must
provide its configuration; other types cannot declare a theme. The SDK validates
and projects these maps; clients apply them as document-root custom properties.
Use the semantic `app.css` design variables for colors, matching foregrounds,
surfaces, borders, radii, spacing, and motion. Existing theme-v1 legacy color
names normalize at the frontend input boundary; explicit semantic names win.
No executable stylesheet or remote asset is loaded.

Themes may declare `fonts`, an array of at most 16 faces, and must require
`theme-fonts-v1` in `compatibility.features` when it is nonempty. Each face has
`family` (1–100 UTF-8 bytes, letters/numbers/spaces/underscore/hyphen),
`entry` (contained package-relative WOFF2, WOFF, TTF or OTF file), optional
`weight` (`normal`, `bold`, or one/two ascending integers in 1–1000) and
`style` (`normal`, `italic`, `oblique`); both default to `normal`. For example:

```json
{ "fonts": [{ "family": "My Sans", "entry": "fonts/my-sans.woff2", "weight": "100 900" }] }
```

Reference that family in `--font-sans`, `--font-heading` or `--font-mono`.
Files must match their extension signature, be regular files within the resolved
package root, and fit 8 MiB per file / 32 MiB per theme. Missing, escaping,
malformed, duplicate family/weight/style, or oversized declarations reject the
package. Ship font licenses and provenance alongside the files. Older Runtimes
reject the required feature explicitly; token-only themes remain valid.
The shared `read_agent_plugin_asset` operation accepts only declared entries
from installed, valid, enabled plugins. Font responses contain `content` as
base64, `encoding: "base64"` and the matching `font/*` MIME; HTML responses
retain ordinary text content. Clients register only the selected theme with
FontFace, remove its faces on switch/disable/uninstall/refresh, and retire late
async loads. Decode/read failures retain system fallbacks. No local filesystem
path or remote font URL is passed to the WebView.
The design-system
[semantic theme contract](../../openagent-design-system/references/semantic-themes.md)
owns shadcn/create recipes, offline fonts and the theme package generator.

Settings → General → Appearance selects one installed theme or OpenAgent default.
Selection enables that package; other enabled themes do not affect presentation.
The selected, enabled, valid theme overlays the application's existing design,
with common tokens followed by the resolved light/dark map. Saved user overrides
apply last. Declare `--background` to paint the window canvas as well as any desired
`--card` content color. Explicit canvas colors take precedence over native
background transparency; user background overrides still win over package colors.
Disablement, uninstall, refresh and update rebuild the overlay;
absent tokens restore their original inline value or the ordinary stylesheet.
Unavailable selections retain their ID and temporarily use the built-in design.
System appearance selects the resolved map. The same styling applies to every
product window, including standalone Settings. The settings draft previews
through the page's single overlay owner; accepted saves notify other windows.
Appearance persistence and normalization belong to configuration's
[save/reload contract](../../openagent-configuration/references/save-and-reload.md).

An integration declares `type: "integration"` and lists `integration-v1` in
`compatibility.features`. Messaging integrations additionally declare
`category: "communication"`; only these packages appear under Integrations →
Channels, including disabled packages so users can enable them there.
Development integrations such as Langfuse remain configurable in Installed plugins.
Do not infer channel membership from names, keywords, commands, or MCP tools. Selecting
an entry uses the package's localized name and description, ordinary lifecycle
switch, and existing configuration/OAuth setup surface. Configuration secrets
remain SDK-owned. Built-in channel adapters retain their ordinary rows; package
IDs are namespaced as `plugin:<id>` so a Discord package cannot select or
configure the built-in Discord adapter. Uninstalling the selected package
returns to the first built-in channel. Skills/MCP/commands retain the ordinary
loading path; the presentation type does not create a channel transport.

Plugin Kit mirrors these declarations in its validator, presentation JSON
schema and `theme`/`integration` starter templates. Its messaging importer
marks channel packages as integrations. Deterministic integration fixtures
qualify this presentation contract without requiring a platform account. The
channel list and detail each own a bounded shared ScrollArea; overflowing lists
must keep their final entries reachable without scrolling the whole settings body.

Run `bun run test:blackbox:channel-settings` against an isolated `channel-settings`
debug instance and explicit Pilot socket. It retains iMessage/Langfuse manifest
classification in process-free fixtures and verifies disabled channel discovery,
localized names, long-list scrolling, narrow layout, Installed access, and
selection recovery after uninstall in both themes and locales.

Qualify with `test:blackbox:plugin-presentation`: install deterministic theme
and integration fixtures, inspect colors and geometry in light/dark and both
locales, drive configuration and lifecycle switches, and assert restoration
and removal. SDK schema/loader tests own malformed declaration rejection.

OpenAgent implements both portable component types:

- Agent Skills are discovered only from immediate child directories under
  `skills/` that contain a conforming `SKILL.md`. The frontmatter `name` must
  match its directory name and contain only 1-64 lowercase letters, digits, or
  single hyphens, the `description` must be 1-1024 characters, and an optional
  `compatibility` must be 1-500 characters. A Skill that violates any of those
  rules is skipped with a diagnostic naming the rule while its siblings still
  load. Valid plugin skills join the global and workspace Skill catalog used
  for model discovery.
- MCP servers are loaded only from root `mcp.json`. The stdio and Streamable
  HTTP transports are supported. Legacy HTTP+SSE entries are reported and
  skipped.

Declare `extensions.openagent.mcp_tool_mode` as `direct` (the default) or
`relay`. Direct tools are available to the model immediately; relay tools are
mounted through `load_tool`. Optional `mcp_tool_modes` maps server names from
`mcp.json` to overrides, for example `{"search":"relay","controls":"direct"}`.
Keep these options in the plugin manifest so the portable MCP schema is intact.
Commands, scripts and hooks may also lease their own declared servers through
the generic `mcp.mount`, `mcp.unmount` and `mcp.status` Host Bridge operations;
see [the OpenAgent contract](openagent-contract.md) for the lifecycle boundary.
Invalid modes reject the manifest; unknown server overrides report a diagnostic.
Mounting mode does not change transport, plugin identity, permissions, locale,
disabled tools, MCP App visibility or availability to Agent Roles.
Installed Settings cards provide Follow plugin declaration, Direct and Relay.
The saved per-plugin override wins over all server declarations, including desktop-control servers; selecting Follow removes the override. Transport and
host-access authorization stay independent.

`extensions.openagent.message_policies` is an optional array for declaring
audience rules for plugin-produced lifecycle messages. Each entry contains a
lowercase `tag`, `user_visible`, and `model_visible` boolean. OpenAgent
namespaces these tags as `plugin:<plugin-id>:<tag>` and rejects malformed or
audience-less entries while retaining the rest of the package.

Automation hook commands can emit a JSON object with `message` and an optional
local `tag`. Tagged output is accepted only when the tag is declared in the
plugin's `message_policies`; the host applies the declared audience policy and
stores the namespaced tag in the checkpoint.

Plugins that need a long-lived capability process may declare
`extensions.openagent.daemon` with a package-relative `command`, string
`args` and `capabilities` arrays, and `transport` set to `stdio` or `socket`.
The Runtime validates containment and reports the normalized descriptor; the
host owns daemon supervision and may connect it through a normal `mcp.json`
client entry.

Desktop shell installations provide a pinned portable Node.js for JavaScript
plugin launchers. Host-supervised launchers use its absolute path; supervised
Runtime children inherit a PATH with that resource directory first, so plugin
MCP, commands and hooks do not require a system Node installation. The host
does not mutate the process-global or OS PATH. Missing shell Node resources
fail startup with repair/reinstall guidance before a plugin attempts downloads.
Standalone SDK/server users remain responsible for their own interpreter.
Packaging provenance belongs to release engineering's `artifacts.md`.

Packages do not declare a Runtime implementation binding. Package components
always load through the same ordinary manifest path and process policy, while
the package owns its domain state and orchestration through the generic Host
Bridge.

`extensions.openagent.commands` is an optional array of portable slash
commands. Each entry has an ID, display `label`, display `description`, an
`argument` mode (`none`, `required_text`, or `optional_text`), a package-relative executable
`command`, and an optional `timeout_secs` from 1 to 300. For example:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "conversation-tools",
  "extensions": {
    "openagent": {
      "commands": [
        {
          "id": "summarize",
          "label": "Summarize",
          "description": "Create a concise conversation summary",
          "argument": "required_text",
          "command": "bin/summarize.cmd",
          "timeout_secs": 30
        }
      ]
    }
  }
}
```

The command is addressed as `/conversation-tools:summarize`. On invocation,
OpenAgent sends a JSON request on stdin containing `conversation_id`,
`plugin_id`, `command`, `argument`, and the original `input`; stdout must be a
non-empty prompt. The executable runs through the normal process boundary and
must remain inside the installed package root.

A declared path carries no interpreter field, so OpenAgent uses one extension
rule for every entry point it runs — a portable command, an automation hook,
and a daemon command alike. A path ending in `.mjs` or `.js` runs under `node`
(the bundled interpreter in supervised desktop sessions); anything else is run
as the program itself. That is why the example above ships a `.cmd`: one JavaScript entry point works on every
platform, while a native or shell entry points at one.

Commands are the only portable slash entry point. A package that needs a
long-lived workflow declares an ordinary command and keeps its reducer,
durable state, prompts, completion rule, recovery, and wake scheduling in its
MCP server or daemon. It uses the common Host Bridge documented in
`references/openagent-contract.md` for conversation, branch, Agent submit/wake,
role, and event operations. The Runtime never registers a package flow,
executes a package loop, or applies a package-specific iteration limit.

Sidebar entries may include `icon` and a `capabilities` array. Capabilities are
limited to `workspace`, `conversation`, `branch`, `files`, `locale`, and
`theme`; the host sends only the requested fields in the versioned
`openagent:sidebar-context` message. File access is metadata-only and never
contains file contents or diffs.

The loader selects its bundled 1.0.0 rules from the canonical `$schema` value;
it never downloads a schema while loading a package. It resolves symlinks,
junctions, and equivalent filesystem indirections before reading, copying, or
executing package content. A manifest escape or fatal manifest violation rejects
the package. A bad component location disables that component type, while an
invalid Skill or MCP entry is skipped without disabling valid siblings. Every
diagnostic names the rule or field it rejected, so the installed plugin card
reports an actionable reason instead of a generic specification error.

For stdio MCP, OpenAgent creates a writable persistent `PLUGIN_DATA` directory,
supplies `PLUGIN_ROOT` and `PLUGIN_DATA` after the configured environment, and
expands only those placeholders in arguments, environment values, and `cwd`.
Plugin-relative commands and working directories must remain inside the
resolved package root. Remote MCP endpoints require HTTPS except for literal
loopback endpoints, and configured headers are not forwarded across an origin
change. The stdio child runs under the plugin process policy described below,
so its writable roots and inherited environment are the resolved policy rather
than the host's.

### Configuration and external authorization

OpenAgent's optional `extensions.openagent.configuration` extension declares
version 1 fields rendered in the installed plugin's settings. Read
[configuration and authorization](configuration-authorization.md) for types,
bindings, storage, repair and qualification. Packages using it must require
`configuration-v1` in `compatibility.features`; older Runtimes reject that
compatibility declaration instead of silently omitting setup. The portable
format remains unchanged. Credentials must never enter package source,
release archives or acceptance reports.

HTTP MCP entries accept the string hints `oauth_resource`,
`oauth_authorization_server`, `oauth_client_id`, and `oauth_scope`. These
describe discovery and public client configuration; they are not credentials
or authorization grants. The Runtime owns discovery, browser callback, token
storage and refresh; see [the OAuth contract](openai-compatibility.md).
Installed plugin settings expose connection testing, browser authorization and
local disconnection for the HTTP servers owned by the validated package.
The Runtime resolves endpoints; clients submit plugin and server identities.
Qualify installation, configuration, authorization and an authenticated primary
tool separately. Local disconnection does not revoke the provider's account grant.

### Installed state and updates

Installed packages live at `<OPENAGENT_HOME>/plugins/<plugin-name>/`. Writable
state lives separately at `<OPENAGENT_HOME>/plugin-data/<plugin-name>/` and is
preserved when the plugin is uninstalled. This makes removal recoverable and
allows a later installation of the same plugin name to reuse its state. Delete
that data manually only when it is no longer needed. Latest-release metadata is
remembered at `<OPENAGENT_HOME>/plugin-update-cache.json`, beside those
directories rather than inside either one: it is a derived cache of upstream
releases, so deleting it costs one extra check and never loses package state.

Installation sources, registries, trust prompts, and sandbox policy are
client-owned behavior rather than part of the portable format. This integration
installs local directories and checks an HTTPS GitHub `repository` for a
latest-release reminder. An explicit update action downloads only a GitHub
release asset whose URL is HTTPS, whose name ends in `.zip`, `.tar.gz`, or
`.tgz`, and whose GitHub `sha256:` digest is present and matches the bytes.
The asset is size-limited, extracted into staging with archive traversal and
link rejection, validated as a complete package with a matching manifest name,
then atomically activated. A tarball built with `git archive` — which is how
the published packages are packed, and how GitHub's own source archives are
produced — opens with a `pax_global_header` metadata member carrying the commit
id; that member is skipped rather than rejected, while any other member that is
neither a file nor a directory still fails extraction. The previous package is
retained until activation succeeds and is restored if replacement fails;
`plugin-data` is never replaced.
An interrupted replacement is repaired during the next Runtime startup before
installed packages are loaded.
Plugin subprocesses remain subject to the normal OpenAgent
process and permission environment; package containment prevents package path
escapes but is not itself the subprocess sandbox, which the next section
describes.

## Plugin process confinement

Every process an installed plugin starts — its stdio MCP servers, its portable
commands, and the daemon the host supervises — carries a policy the Runtime
resolves at load time from the user's current session permission profile. The
profile is inherited, never widened: host-root read, the active workspace's
write access, and the session's network tier are exactly what the user already
granted to ordinary agent commands, and the only addition is a write grant on
that plugin's own `<OPENAGENT_HOME>/plugin-data/<plugin-id>/`. A capability such
as `desktop-control` may request real computer access, but the request never
grants itself access. The user must enable the per-plugin host access switch;
only then does the Runtime resolve that plugin to an unmanaged process with a
recorded user-authorization reason. Missing grants remain confined, including
Cua Driver.

- The policy anchors on the active workspace. With no active workspace the
  anchor is the immutable package root and the inherited workspace write is
  downgraded to read, so a plugin never gains write access to its own package.
  A portable command still requires an active workspace, because its working
  directory has to resolve inside a permission root, and reports the missing
  workspace instead of running.
- `PLUGIN_DATA` is writable, and the child's `TMPDIR`, `TEMP`, and `TMP` point
  inside it: the managed backends bind no system temp directory, so the
  child's scratch space is part of its confinement rather than an extra grant.
- The host's own credentials are removed from the child environment — names
  ending in `_API_KEY`, `_ACCESS_KEY`, `_API_TOKEN`, `_ACCESS_TOKEN`, or
  `_SECRET_KEY`, the `AWS_*` credential names, `GITHUB_TOKEN`/`GH_TOKEN`, and
  the `ANTHROPIC_`, `OPENAI_`, and `OPENAGENT_` namespaces with `OPENAGENT_HOME`
  retained. Values the package declares itself in `mcp.json` still apply. This
  bounds inherited secrets only: the inherited host-root read keeps a
  credential file on disk readable, which is the user's own choice.
- A package `capabilities` declaration is a signal, not an authorization. It
  never widens the resolved policy, so a server that declares network access
  still runs under the session's network tier. The `network` token is the one
  signal the Runtime reads: a package that declares it while the profile
  restricts network access gets one diagnostic naming the plugin when its
  process starts, instead of failing at the first socket. Declaring it changes
  nothing about the policy.
- A profile the host's backend cannot enforce fails closed with a diagnostic
  naming the reason instead of starting an unconfined process, so the plugin's
  MCP tools are absent until the profile is enforceable again. On Linux that
  includes WSL1, which cannot create the user namespaces the sandbox needs.
- On Windows a session whose network tier restricts network access needs a
  one-time sandbox setup, and **a plugin process never raises an elevation
  prompt**. When that setup has not run, the plugin's start fails closed with a
  diagnostic naming the plugin and pointing at an ordinary agent command, which
  is the path allowed to ask for elevation. A package cannot provision itself,
  and installing one grants no privilege that would let it.
- That gate asks the sandbox crate's own readiness predicate, which compares a
  setup version and the stored accounts rather than the proxy settings the
  offline account's filters depend on. A host whose proxy configuration changed
  while a marker from the previous configuration survived still reads as
  provisioned, and can then reach the setup path from a plugin process. The gate
  narrows the window rather than closing it, which is why an unexpected prompt
  there is a bug worth reporting.
- Because the session profile owns the network tier, that profile is the only
  way to grant a plugin process network access. Install any runtime dependency
  a server would otherwise download at spawn time.

Automation hook commands are lifecycle configuration rather than plugin
capabilities, so they keep inheriting the session profile directly.

Installed portable plugins share the product plugin lifecycle switch. Disabled
plugins remain installed for rollback and update checks, but their Skills, MCP
servers, Automation Hooks, and sidebar surfaces are not mounted into a new
Runtime assembly. Re-enabling the plugin restores those components without
changing its package data.

All published standard packages use the same package overlay and verified
GitHub release updater. CUA declares a direct embedded stdio server in root
mcp.json, owns its provisioning launcher, and starts no standalone application.
Driver updates are package-owned and separate from plugin release updates.
Screenshot export preparation is also package-owned: the Cua launcher prepares
explicit window/desktop MCP output paths before forwarding to the driver;
ordinary reads retain inline image content. The package's bundled Skill owns
path resolution and failure recovery. Keep this handling out of the desktop
host and shared MCP transports.

MCP startup and `--openagent-prepare` check stable driver tags at most once every
six hours and activate a verified platform asset before the next MCP connection.
Serve and stop use the selected cache without an update check. Update failure
retains the verified selection or falls back to the bundled pin; explicit
`OPENAGENT_CUA_DRIVER_BIN` overrides bypass updating. A running MCP server changes
version on its next ordinary connection. Selection, cache recovery, retained
releases and preparation locking are owned by the Cua package README and Skill.

All packages use the same user authorization boundary.
The Settings installation flow checks the validated package's `desktop-control`,
`host-access`, and `computer-use` capabilities after copying the package and
before desktop activation. If saved per-plugin access is absent, present a
localized authorization dialog naming the package, explaining computer access
and sandbox removal, and offering Allow real computer access or Not now.
Persist an affirmative grant through normal Settings saving before consuming it
at process launch. Deferral, Escape, and outside dismissal grant nothing, retain
the installed package, and report that related features require authorization.
Existing saved grants do not prompt again. Concurrent installation prompts are
serialized by plugin ID and survive Settings remounts; a stale answer cannot
authorize another package. A save failure keeps the prompt open for retry.
Chat answers and model statements are never persisted authorization.

The settings surface exposes the plugin enable switch, MCP tool-scope switches,
and a generic real-computer-access switch for plugins whose declared
capabilities request it. The switch is persisted per plugin and is the user
authorization boundary.

## Discovery categories

`extensions.openagent.category` is optional presentation metadata with one stable
ID: `development`, `productivity`, `communication`, `automation`, `data`, `design`
or `other`. Omission means uncategorized; null, arrays, empty strings and unknown
IDs reject the manifest with a category diagnostic. Keep names localized in the
client; IDs never change with locale. Category grants no permissions and changes
no component loading or process policy. Older Runtimes ignore the optional
metadata and continue loading the package, so plugin protocol 1 is unchanged.

Declare it inside the OpenAgent extension, for example:

```json
{ "extensions": { "openagent": { "category": "development" } } }
```

### Uniform MCP ownership

Every package, including desktop-control packages, contributes MCP exclusively
through root `mcp.json`. Hosts must not reserve a package ID, seed a configuration
entry, rewrite its executable, or provide package-specific controls or IPC.
Domain runtime flags, provisioning and application suppression belong to the
package launcher. CUA uses direct embedded stdio MCP and declares no daemon.
