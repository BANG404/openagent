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
OpenAI examples' `type: "http"` alias and ignores the informational
`oauth_resource` field after validating the HTTPS endpoint. Hook commands are
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

Product-owned standard packages may also declare
`extensions.openagent.runtime` as `chat-groups`, `goal`, `graph`, or
`cua-driver`. This binds the package to exactly one trusted product capability.
The package repository is the default GitHub subscription source; verified
release archives can overlay the matching builtin package while the Runtime
continues to own durable state, permissions, and execution.

`extensions.openagent.commands` is an optional array of portable slash
commands. Each entry has an ID, display `label`, display `description`, an
`argument` mode (`none` or `required_text`), a package-relative executable
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
rule for every entry point it runs — a portable command, a flow step, an
automation hook, and a daemon command alike. A path ending in `.mjs` or `.js`
runs under the session's `node`; anything else is run as the program itself.
That is why the example above ships a `.cmd`: one JavaScript entry point works
on every platform, while a native or shell entry points at one.

`extensions.openagent.flows` is an optional array of package-owned autonomous
loops. Each entry has an ID, display `label`, display `description`, an
`argument` mode (`none` or `required_text`), a package-relative executable
`step`, an optional `timeout_secs` from 1 to 300, and an optional
`max_iterations` from 1 to 100. The Runtime runs the loop and the package owns
every decision inside it; see
`references/openagent-contract.md` for the stdin/stdout step contract. A flow's
step receives the same `PLUGIN_ROOT` and `PLUGIN_DATA` as the package's stdio
MCP servers, so a package keeps one state directory across its step and its
tools.

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

The Cua Driver is a standard published package at
`https://github.com/BANG404/openagent-cua-driver`. The package ships a launcher
and no driver: its `bin/cua-driver.mjs` puts the pinned upstream release into the
package's own `PLUGIN_DATA` on first use, and the desktop host starts that
launcher instead of a bundled executable. The host supplies the private endpoint,
the lifetime pipe, `PLUGIN_DATA`, and the product-policy arguments; the package
declares the program, its interpreter, and the `serve --embedded` it publishes.
The reserved `cua-driver` MCP entry remains the client connection. Cua Driver,
Chat Groups, Goal Mode, and Graph Mode all use the same trusted package overlay
and verified GitHub release updater.

The Cua topology uses the same user authorization boundary as every plugin. The
desktop host runs `<launcher> serve --embedded --permission-mode unrestricted
--dangerously-bypass-approvals --parent-liveness-stdio --socket <endpoint>`,
waits until that endpoint accepts connections, and then the reserved MCP client
runs the same launcher with `mcp --embedded --socket <endpoint>`. The daemon owns
the desktop runtime; the MCP process remains a protocol client. Never pass
`--grant` to the client: it configures a runtime the driver launches itself, it
is valid only in standard permission mode, and the driver refuses it whenever a
daemon already listens on the endpoint.

Because the launcher fetches tens of megabytes on a machine that has no cached
driver, the host asks it to provision first — the same command line plus
`--openagent-prepare`, which fetches, verifies the pinned digest, and exits —
before it starts the daemon. That step has its own long budget; the daemon's
startup timeout must never pay for a download, and a slow first fetch must not
look like a daemon that failed to listen. `OPENAGENT_CUA_DRIVER_BIN` overrides
the whole mechanism for a driver the user already has, and a machine the pin
table has no release for gets a named failure rather than a wrong-architecture
binary.

The daemon runs outside the managed process sandbox only after the user grants
the plugin real computer access. The host consumes that authorization at the
same spawn point as every other plugin process and refuses a daemon whose policy
is still managed, so an installed package cannot silently obtain desktop
control.

Both `--embedded` flags are lifetime contracts, not cosmetics. The daemon's
makes it stay inside the host's process tree instead of relaunching itself as a
standalone app; the client's makes an unreachable endpoint a hard failure
instead of a reason to start a standalone Cua app whose lifetime belongs to
nobody. `--parent-liveness-stdio` makes the daemon exit on stdin EOF, so the
host holding that pipe is what guarantees the daemon cannot outlive it.

`cua-driver mcp --socket` cannot start a daemon on Windows or Linux, so the host
owns the daemon lifecycle. The host reports its private endpoint through
`cua_driver_endpoint`, the frontend persists it into the reserved entry, and
`start_cua_driver_serve` starts the daemon idempotently and returns whether this
call spawned it. The endpoint is deliberately not the driver's own default, so a
standalone `cua-driver` installation can never answer the reserved entry with
standard-mode authorization. A Runtime that already connected its persisted MCP
list before the daemon existed reconnects when the bootstrap saves settings
after a fresh start.

The reserved entry's persisted `command` is a placeholder, not a program: the
Runtime replaces it with the launcher the installed package declares when it
mounts MCP servers, and exports that package's `PLUGIN_DATA` to the child. An
entry whose package, launcher, or daemon declaration is missing is disabled with
a named error rather than started, and the settings probe applies the identical
substitution, so a manual test cannot report a success the mount would not
deliver. The exemption names an identity, never a program path.

The settings surface exposes the plugin enable switch, MCP tool-scope switches,
and a generic real-computer-access switch for plugins whose declared
capabilities request it. The switch is persisted per plugin and is the user
authorization boundary.
