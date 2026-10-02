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

`repository` may point to an HTTPS GitHub repository. The integration checks the
latest stable release and reports a version transition and verified archive
candidate. The Settings surface performs replacement only after an explicit
Update action. Release assets must be HTTPS GitHub `.zip`, `.tar.gz`, or `.tgz`
files with a GitHub `sha256:` digest. OpenAgent limits the download size,
rejects traversal and links while extracting, and accepts a tarball packed with
`git archive` — including GitHub's own source archives — by skipping the
`pax_global_header` metadata member it opens with, without accepting any other
non-file member. It validates the complete manifest and component set in
staging, then atomically activates the candidate while preserving
`plugin-data`; activation failures restore the previous package. A check never
downloads or executes a release.

The check is cheap by design. Results are cached per repository for ten minutes
and revalidated with a conditional request afterwards, so repeated loads and
repeated clicks normally cost nothing. When the public quota is exhausted or
the network is unreachable, OpenAgent says so once at the top of the Plugins
page instead of reporting each plugin as broken; only a repository that is
unusable or serves no installable release is reported as that plugin's own
problem.
