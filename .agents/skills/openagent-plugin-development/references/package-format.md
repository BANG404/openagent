# Agent Plugins

OpenAgent can load portable [Agent Plugins](https://agent-plugins.org/) version
1.0.0 from local directories. Open **Settings → Agent Plugins** and choose a
folder whose root contains `plugin.json`. Installation copies the validated
package into the active `OPENAGENT_HOME`; the original folder is not used at
runtime.

OpenAgent implements both portable component types:

- Agent Skills are discovered only from immediate child directories under
  `skills/` that contain a conforming `SKILL.md`. Valid plugin skills join the
  global and workspace Skill catalog used for model discovery.
- MCP servers are loaded only from root `mcp.json`. The stdio and Streamable
  HTTP transports are supported. Legacy HTTP+SSE entries are reported and
  skipped.

The loader selects its bundled 1.0.0 rules from the canonical `$schema` value;
it never downloads a schema while loading a package. It resolves symlinks,
junctions, and equivalent filesystem indirections before reading, copying, or
executing package content. A manifest escape or fatal manifest violation rejects
the package. A bad component location disables that component type, while an
invalid Skill or MCP entry is skipped without disabling valid siblings. Settings
shows these diagnostics on the installed plugin card.

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

Installation sources, registries, updates, trust prompts, and sandbox policy are
client-owned behavior rather than part of the portable format. This integration
installs local directories and does not provide a marketplace or automatic
update channel. Plugin subprocesses remain subject to the normal OpenAgent
process and permission environment; package containment prevents package path
escapes but is not itself a subprocess sandbox.
