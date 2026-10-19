---
title: Commands and lifecycle hooks
description: Turn slash input into an Agent prompt and react to lifecycle events without embedding a private Runtime loop.
---

A Skill supplies instructions, an MCP tool performs an operation, and a slash command gives users an explicit entry point. Hooks react to execution events. Combine these components only where your workflow needs them.

## Create a portable command

From your project root:

```sh
bun tools/openagent-plugin-kit/scripts/new-plugin.mjs notes-command --template slash-commands --dir plugins
```

Replace the generated command entry in `extensions.openagent.commands` with:

```json
{
  "id": "summarize",
  "label": "Summarize decisions",
  "description": "Summarize decisions for the supplied topic",
  "argument": "required_text",
  "command": "bin/summarize.mjs",
  "timeout_secs": 30
}
```

Create `bin/summarize.mjs`:

```js
import { readFileSync } from 'node:fs';

const request = JSON.parse(readFileSync(0, 'utf8'));
if (typeof request.argument !== 'string' || !request.argument.trim()) {
  console.error('A topic is required.');
  process.exit(1);
}
process.stdout.write(
  `Summarize confirmed decisions and open questions for this topic. Read relevant project files and cite them.\nTopic: ${request.argument}`
);
```

Replace the generated `commands.word-count.*` translation keys with `commands.summarize.label` and `commands.summarize.description` in every declared locale. Remove unused generated command files. Validate, install, and invoke `/notes-command:summarize release planning` in an active workspace.

The host writes JSON to stdin with `conversation_id`, `branch_id`, `plugin_id`, `command`, `argument`, and original `input`. Stdout must be a nonempty **prompt**, which enters the normal Agent pipeline; it is not a direct tool-result channel. Log diagnostics to stderr. `argument` can also be `none` or `optional_text`.

Commands run with the active workspace as working directory. Resolve package resources using `PLUGIN_ROOT` or the script's own location, and write durable plugin state to `PLUGIN_DATA`. A `command` is a contained executable file, not a shell expression. JavaScript `.mjs`/`.js` entries use Node; native/shell launchers need platform-specific handling. This matters when adapting the template's `.cmd` example for other platforms.

## Add an event hook

Use the `automation-hooks` template for a complete starting package. Its extension combines an automation entry with a declared message audience:

```json
{
  "automation": [
    { "id": "after-tool", "event": "after_tool", "matcher": "^(apply_patch|exec_command)$", "command": "hooks/after-tool.mjs", "timeout_secs": 15 }
  ],
  "message_policies": [
    { "tag": "notice", "user_visible": true, "model_visible": false }
  ]
}
```

Create the referenced file and emit a notice only when your handler has something useful to report:

```js
process.stdout.write(JSON.stringify({ message: 'Project notes need review.', tag: 'notice' }));
```

This demonstrates output shape; translate real notices using the live host locale. The host namespaces the local tag with the authenticated package identity. An undeclared tag is rejected. Display-only notices are persisted UI records and do not become user-authored prompts or suffixes on another tool's result. Untagged text retains the hook's default model-context behavior.

Hook routing lives inside the stdin envelope's `event`. Use the public client's `hookEvent` and `hookContext` helpers rather than assuming identifiers are top-level. Match the actual exposed tool name for your intended event; hooks run under the normal permission profile and must finish within their timeout.

## Handle completion and cancellation

For a Stop hook that continues work, use `event.execution_id` to deduplicate each execution and inspect `event.phase`:

| Phase | Workflow action |
| --- | --- |
| `interrupted` | Wait for the existing approval or user input |
| `final_completed` | Continue only if package-owned work remains and its budget permits |
| `final_cancelled` | Stop and retain cancellation |
| `final_failed` | Retain diagnostics and require explicit recovery |

Persist bounded continuation state before scheduling another wake. Do not restart a cancelled run or replace unresolved approvals. [Host Bridge workflows](../workflows/) explains branch-safe wakes; [local development](../local-development/) covers repeatable acceptance.
