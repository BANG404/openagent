---
title: Models, permissions, and extensions
description: Configure Chat and Flash models, separate approval from sandbox policy, and install useful extensions.
---

## Configure and test a model service

Open **Agent → Models → Providers** to manage model services. Add or select a service, choose its type, and enter the request address and required credentials. Use the service's connection test, then fetch its model list or add the exact model/deployment name supported by your account. Keep the service enabled.

Next open **Models → Default models** and choose the service/model pair for Chat and Flash. Switching a service also changes its available model choices; check both selections after editing a service. Send a short chat, then check a background task if you changed Flash.

| Setting | How to choose it |
| --- | --- |
| Request/API address | Use the provider's API endpoint, not its ordinary website or login page |
| API mode | Match the service's supported Responses or Chat Completions interface where applicable |
| Model name | Use the exact API model or deployment identifier, not only a display label |
| Vision | Enable only for a model/API that actually supports image input |
| Reasoning effort | Enable only when the service accepts the corresponding parameter |
| Context window | Enter the model's real limit; this also caps automatic compaction thresholds |

ChatGPT OAuth uses a built-in model catalog that can lag your account's available models. Add an available model manually when needed. Fetching that catalog again replaces the configured list, including manual entries. A successful list fetch or connection detection still needs an actual model-call test.

Configure fallback models and retry count/delay under Default models when needed. A fallback must be available to your account too. Repeated authentication, model-name, or unsupported-parameter errors require a settings correction rather than more retries.

## Separate approval from execution permissions

The composer's approval selector is a shortcut to approval mode. **Agent → Execution & Permissions** also controls the independent filesystem/network policy:

| Approval mode | Behavior |
| --- | --- |
| Manual | Review tool calls except explicitly exempt lifecycle controls |
| Automatic | Flash assesses proposed calls; consequential or uncertain calls go to manual review |
| Off | No approval flow; the execution permission profile still applies |

Approval defaults to Off. It does **not** select or disable a sandbox. Approving a command cannot make an otherwise forbidden path or network connection available.

Managed execution offers workspace-writable, read-only, and advanced path-rule profiles, with network access configured separately. The default allows host-wide reads and writes in the active workspace, while broad writable rules keep `.git`, `.agents`, and `.codex` read-only. Additional explicit rules can change this boundary. Inspect the actual profile when a task needs another location. Disabled isolation uses the application's ambient process access.

A managed command fails if the platform's sandbox helpers cannot enforce the selected policy. On Windows, first use of restricted networking may require the normal sandbox provisioning/UAC flow. Fix the specific setup error through an ordinary Agent command; installing a plugin is not a way to grant it access or provision the sandbox.

## Install and use a plugin

1. Open **Integrations → Plugins** and browse/search the store. Check the package's function, language support, platform requirements, and README.
2. Choose **Install** and wait for its task to finish. A package requesting real-computer access has a separate grant prompt; **Not now** keeps it installed without granting that access.
3. In Installed, confirm enablement. Fill required configuration and authorize its external service if applicable.
4. Use its documented command or ask the Agent to perform a concrete supported operation. Inspect the actual tool result and panel, if provided.

Plugin enablement, Direct/Relay tool mounting, real-computer access, and provider authorization are separate controls. **Follow plugin declaration** removes your mounting override; Direct makes tools immediately available, while Relay lets the Agent discover/mount them through `load_tool`. Role availability and the active permission profile still apply.

Installed updates are independent of desktop versions. Check for updates and use **Update** or **Update all** as appropriate; active work may delay activation. Local-directory authors can [refresh an associated source](../../plugins/local-development/). Uninstall retains package data and private settings.

For your own MCP server, use **Integrations → Extensions** and configure its supported stdio or HTTP transport. Check the executable/dependencies or endpoint and authentication. Keep package-owned MCP in its plugin rather than duplicating it as a user server.

## Keep reusable instructions and preferences

| Item | Scope and use |
| --- | --- |
| Global user memory | Standing personal preferences in the active home's `memory.md` |
| Workspace memory | Project-specific context in `<workspace>/.agents/memory.md` |
| Global Skill | `~/.agents/skills/<name>/SKILL.md` |
| Workspace Skill | `<workspace>/.agents/skills/<name>/SKILL.md` |
| Role | A reusable Agent workflow selectable for conversations/delegation |

Skills need YAML `name` and `description` and load when relevant to the task. Manage memory through the Memory surface or the Agent's memory tools; don't overwrite maintained notes as a troubleshooting shortcut. Appearance and language follow General settings; a theme plugin changes declared appearance tokens rather than model behavior.

Conversation data is stored locally, but model requests send the selected prompt/context/attachments to the configured service. Plugins and MCP services can contact their own providers. Automatic diagnostics can be changed in **General → Privacy & diagnostics**; explicit problem reports are a separate action. See [data and troubleshooting](../troubleshooting/) for backups and support.
