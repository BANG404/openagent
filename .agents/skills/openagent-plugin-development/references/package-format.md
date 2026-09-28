# Agent Plugins

OpenAgent can load portable [Agent Plugins](https://agent-plugins.org/) version
1.0.0 packages whose root contains `plugin.json`. Validated packages are
installed under the active `OPENAGENT_HOME`; the original folder is not used at
runtime. The desktop Integrations settings surface can install a local folder,
refresh installed packages, enable or disable them, uninstall third-party
packages, and apply verified GitHub release updates.

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
change.

Installed packages live at `<OPENAGENT_HOME>/plugins/<plugin-name>/`. Writable
state lives separately at `<OPENAGENT_HOME>/plugin-data/<plugin-name>/` and is
preserved when the plugin is uninstalled. This makes removal recoverable and
allows a later installation of the same plugin name to reuse its state. Delete
that data manually only when it is no longer needed.

Installation sources, registries, trust prompts, and sandbox policy are
client-owned behavior rather than part of the portable format. This integration
installs local directories and checks an HTTPS GitHub `repository` for a
latest-release reminder. An explicit update action downloads only a GitHub
release asset whose URL is HTTPS, whose name ends in `.zip`, `.tar.gz`, or
`.tgz`, and whose GitHub `sha256:` digest is present and matches the bytes.
The asset is size-limited, extracted into staging with archive traversal and
link rejection, validated as a complete package with a matching manifest name,
then atomically activated. The previous package is retained until activation
succeeds and is restored if replacement fails; `plugin-data` is never replaced.
An interrupted replacement is repaired during the next Runtime startup before
installed packages are loaded.
Plugin subprocesses remain subject to the normal OpenAgent
process and permission environment; package containment prevents package path
escapes but is not itself a subprocess sandbox.

Installed portable plugins share the product plugin lifecycle switch. Disabled
plugins remain installed for rollback and update checks, but their Skills, MCP
servers, Automation Hooks, and sidebar surfaces are not mounted into a new
Runtime assembly. Re-enabling the plugin restores those components without
changing its package data.

The product-managed Cua Driver is exposed as the trusted builtin
`cua-driver` descriptor, while its implementation remains host-owned. Release
builds stage the pinned upstream `trycua/cua` binary distribution as a verified
Tauri resource, copy that resource into the product's per-user cache before the
daemon starts, prepend the staged copy only for OpenAgent child processes, and
keep exposing the driver through the reserved `cua-driver` stdio MCP entry. Do
not make that reserved entry user-installable or fall back to an unrelated
binary on `PATH` when the bundled resource is present. Chat Groups, Goal Mode,
and Graph Mode use the same trusted builtin descriptor pattern while retaining
their existing Runtime state and checkpoint behavior.

The Cua topology is fixed product policy rather than user configuration. The
desktop host starts `cua-driver serve --embedded --permission-mode unrestricted
--dangerously-bypass-approvals --parent-liveness-stdio --socket <endpoint>`,
waits until that endpoint accepts connections, and then the reserved MCP client
connects with `cua-driver mcp --embedded --socket <endpoint>`. The daemon owns
the desktop runtime; the MCP process remains a protocol client. Never pass
`--grant` to the client: it configures a runtime the driver launches itself, it
is valid only in standard permission mode, and the driver refuses it whenever a
daemon already listens on the endpoint.

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

The settings surface exposes only the plugin enable switch plus the MCP
tool-scope switches. Do not reintroduce permission-mode, socket, grant, or
capability-manifest settings, and do not attach a capability manifest: a
narrow-only ceiling would contradict the fixed unrestricted launch.
