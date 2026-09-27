# Third-party plugin development

This reference is the implementation guide for a plugin author or a
contributor adding a plugin fixture. It describes the smallest package that
can be loaded by OpenAgent; the portable package reference remains the source
of truth for fields not shown here.

## Package shape

```text
my-plugin/
  plugin.json
  skills/
    summarize/
      SKILL.md
  mcp.json                 # optional
  ui/
    panel.html              # optional sidebar entry
  hooks/
    after-tool.cmd          # optional automation entry
```

The manifest must use the bundled Agent Plugins 1.0 schema and a lowercase
portable name. OpenAgent extensions stay under `extensions.openagent`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "repository": "https://github.com/example/my-plugin",
  "extensions": {
    "openagent": {
      "capabilities": ["sidebar", "automation"],
      "sidebar": [
        {
          "id": "panel",
          "title": "My panel",
          "entry": "ui/panel.html",
          "scope": "conversation"
        }
      ],
      "automation": [
        {
          "id": "after-tool",
          "event": "after_tool",
          "matcher": "*",
          "timeout_secs": 15,
          "command": "hooks/after-tool.cmd"
        }
      ]
    }
  }
}
```

Sidebar entries are UTF-8 HTML and run in a sandboxed iframe. The host sends
only the versioned allowlisted sidebar context. Do not expect transcript text,
model output, Inspector records, or another plugin's state.

## Local development

Use Settings -> Plugins -> Install to select a package directory. The host
copies it into a staging directory, validates it again, then atomically
activates it under `OPENAGENT_HOME/plugins/<name>/`. A fixture should use a
temporary `OPENAGENT_HOME` and must not write to the developer's normal
`~/.openagent` state.

When changing a component, verify all of these boundaries:

- a malformed optional component disables only that component;
- a path containing `..`, a symlink, or a junction cannot escape the package;
- automation commands execute from the installed package root and honor the
  normal timeout and process sandbox;
- sidebar selection follows its declared global, workspace, or conversation
  scope;
- uninstall removes the package while preserving plugin data.

## Updates

`repository` may point to an HTTPS GitHub repository. The current integration
checks the latest stable release and reports a version transition. It does not
download, replace, or execute a release during a check. Any future activation
flow must stage and validate the candidate, verify its digest, and retain a
rollback path before replacing the active package.
