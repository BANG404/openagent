---
title: Your first plugin
description: Create, validate, and install a small Skill package without building OpenAgent from source.
---

You need an installed OpenAgent, Git, and Bun 1.2 or newer. Add Node.js when using templates with scripts or MCP servers. Plugin authoring does not require access to OpenAgent's private SDK or a desktop source build.

## 1. Get the public toolchain

Run these commands from your project root. This example uses `plugins/` for authored packages and `tools/` for the toolchain; use your project's existing convention if it has one.

```sh
git clone https://github.com/BANG404/openagent-plugin-kit.git tools/openagent-plugin-kit
bun tools/openagent-plugin-kit/scripts/new-plugin.mjs project-notes --template minimal --dir plugins
```

The generated package is `plugins/project-notes/`. Keep its `plugin.json` at the root, and preserve the generated compatibility and language declarations.

## 2. Write a Skill

Replace the generated Skill directory with `skills/project-notes/SKILL.md`:

```markdown
---
name: project-notes
description: Summarize project decisions when the user asks to record or review them.
---

Read the relevant project files before summarizing.
Separate confirmed decisions from open questions.
When the user asks to save a note, write to the project path they specify.
Include file references and never include credentials.
```

Skills are discovered from immediate child directories of `skills/`. Each needs YAML `name` and `description`; a Skill provides instructions and does not itself register an executable tool. Discovery is conditional on the task, so make the description specific.

## 3. Validate the package

```sh
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/project-notes --require-i18n
```

Fix errors and inspect warnings before installing. The validator checks the package without executing its commands or servers. Declare only UI languages actually covered by your manifest and visible surfaces.

## 4. Install and try it

Open **Settings → Plugins → Install** and select `plugins/project-notes/`. Enable the installed package, open a project conversation, and ask the Agent to use `project-notes` to summarize a concrete decision.

OpenAgent copies the source into its managed plugin directory. **Reinstall after editing the source**; modifying your development folder does not change the installed copy. For isolated acceptance, use a separate test installation or a task-specific `OPENAGENT_HOME`, preserving your usual data.

Check that the Skill is discovered for the intended task, references real project files, and respects the selected approval policy. Then continue to [the package contract](../package/).

## Prefer an assisted workflow?

Install Plugin Developer (`openagent-plugin-kit`) to create and qualify packages using its `/openagent-plugin-kit:create` workflow. That assistant requires a sufficiently recent Runtime for execution IDs, MCP leases, and control-file supervision; see its [workflow requirements](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/development-workflow.md).
