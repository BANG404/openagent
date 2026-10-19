---
title: Local development and debugging
description: Refresh source-associated packages, diagnose loading failures, and collect reproducible acceptance evidence.
---

## Iterate on a source-associated installation

Keep the package in your project's plugin directory. In OpenAgent, select that directory once through **Integrations → Plugins → Install**. Installation validates and copies the package, then records an association with that exact local source. Runtime processes execute the installed copy.

After editing, OpenAgent detects source-content changes, including changes without a version bump. Use **Refresh** on the installed card or the Installed toolbar to request the same synchronization. Activation waits for conversation tasks in every Runtime sharing that package root to finish; it releases MCP/daemon processes before replacing files and refreshing hooks and views. Do not cancel unrelated work to force activation.

Configuration, private settings, grants, and `PLUGIN_DATA` survive refresh. Missing/invalid sources, a changed manifest name, or escaping links preserve the installed package and report a recoverable error. `.git` is excluded from copying and content digests.

Archive/release installations have no local source association. Older installations do not infer one: select the desired local directory through **Install** once to associate it. Do not edit the managed installed directory or expect arbitrary folders to be scanned. Re-run package validation after every meaningful change.

## Diagnose by boundary

| Symptom | Check first |
| --- | --- |
| Package rejected | `plugin.json`, verified protocol range, required features, i18n keys, and containment diagnostics |
| Skill missing | Immediate `skills/<name>/SKILL.md`, matching directory/frontmatter name, task-specific description |
| MCP tools missing | Enablement, server diagnostics, interpreter/dependencies, stdio framing, saved Direct/Relay override, role availability |
| Server starts but service fails | Required configuration, actual account authorization, current network policy, and a primary tool call |
| Source edits are invisible | Local association, actual selected source, validation failure, and tasks delaying activation |
| Command fails before an Agent turn | Active workspace, contained executable path, valid stdin handling, and nonempty stdout prompt |
| Panel is missing or stale | Declared scope, `activation_tools`, requested context capabilities, installed revision, and `sidebar.<id>.title` translations |
| Computer-control tool is unavailable | Separate explicit host-access grant and platform prerequisites; enablement does not grant access |

Check stderr and component diagnostics without logging secrets. A visible card, loaded server, or setup response alone does not prove the intended workflow works.

## Verify the exact candidate

Use a task-specific `OPENAGENT_HOME` when launching an isolated development instance; do not reuse your regular account data. Keep the ordinary execution permission profile. Test package validation, package-owned behavior tests, installed components, invalid inputs, cancellation, restart, and update/data recovery as applicable.

For UI, inspect the real OpenAgent window in every advertised language and light/dark themes. Switch locale while entering data, change conversations/branches, reopen the view, and confirm state survives where promised. Sidebar locale changes must not remount the frame and lose drafts.

Retain the package revision/version or content digest, tested host version, relevant settings, exact assertions, and report/log paths. After a source change, collect new evidence for the new bytes. An external service that was unavailable remains an explicit untested requirement.

## Assisted development with Plugin Developer

Install `openagent-plugin-kit` from the store or its public package directory, enable it, and open your project workspace. Create the project's plugin parent directory before using a structured destination:

```text
/openagent-plugin-kit:create {"goal":"Create a notes tool with durable storage and English/Chinese notices; verify write, read, and restart","name":"my-notes","directory":"plugins/my-notes","template":"mcp-tools","template_repository":"https://github.com/BANG404/openagent-plugin-kit","template_subdirectory":"templates/mcp-tools","skills":["openagent-plugin-authoring"],"max_iterations":12}
```

You can also supply free-text requirements. The kit scaffolds or selects a contained workspace package, then records validation, tests, and isolated Runtime acceptance against its current digest. MCP acceptance needs real tool-result assertions. The three generic gates do not replace your explicit feature or UI requirements.

| Command | Purpose |
| --- | --- |
| `/openagent-plugin-kit:status` | Inspect saved progress and report paths |
| `/openagent-plugin-kit:stop` | Stop the development workflow |
| `/openagent-plugin-kit:resume` | Resume after addressing a failure or rejected candidate |
| `/openagent-plugin-kit:accept` | Record developer acceptance of a qualified candidate |

Acceptance does not publish a repository or release. Review the concrete candidate and authorize publication separately. The assistant needs a Runtime supporting execution IDs, MCP leases, and control-file supervision; see the [workflow requirements and reports](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/development-workflow.md).

## Contributing inside OpenAgent itself?

The host repository's `plugins/dev-index.json` maps independent plugin repositories. Run `bun scripts/prepare-plugin-sources.mjs` to initialize subscriptions and `bun run plugin:dev --path <id>` to resolve an installation path. `bun run plugin:sync` explicitly updates clean subscriptions; the index alone does not install or enable a plugin. This contributor workflow is optional for third-party authors and requires no private SDK changes. Continue to [publishing](../publishing/) once the candidate is accepted.
