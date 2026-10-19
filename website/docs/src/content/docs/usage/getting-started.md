---
title: Install and start
description: Install OpenAgent, connect a model service, choose a workspace, and complete your first useful conversation.
---

OpenAgent is a desktop workspace where an Agent can read project files, edit them, run tools, and keep conversation history. Start with a small read-only task before asking it to change a project.

## 1. Choose a desktop installer

Download the package for your operating system and architecture from [OpenAgent Releases](https://github.com/BANG404/openagent/releases), or use the [website's download options](../../../#download). Select a release that includes desktop installers; a component-only release updates an existing installation.

| Package | First launch |
| --- | --- |
| Full/offline bundle | Includes the Runtime, interface, local embedding resources, and platform helpers; Windows includes WebView2 |
| Online bundle | Downloads and verifies the application resources during initial setup |

An offline bundle avoids application-resource downloads; the selected model service may still require an Internet connection. OpenAgent does not include a hosted model subscription or API credentials.

## 2. Complete first-use setup

Open the application and follow its setup window:

1. Wait for required resources to become ready. If preparation fails, use its retry or offline import action and read the reported resource error.
2. Choose language, theme, and an existing **workspace folder** in Preferences. The workspace is the project directory where you want the Agent to work.
3. Add a model service. Choose the actual service type, enter its endpoint and credentials or complete its supported login, then test the connection.
4. Fetch or add the models your account can use. Choose a **Chat model** and a **Flash model**, inspect the summary, and finish setup.

Chat performs the main conversation. Flash handles smaller background tasks such as titles, context compaction, and configured automatic approval checks. A working catalog entry is not proof that your account can call that model; test a short conversation too. You can change both bindings later in **Agent → Models → Default models**.

For OpenAI-compatible services, the address can be the host, a `/v1` root, or a complete `/chat/completions` URL; OpenAgent normalizes it to the API root. Select the API mode your endpoint actually supports. More details are in [models and permissions](../configuration/).

## 3. Run a first task

Create a conversation in the selected project and send:

```text
Read the project's README and main source folders. Explain what this project does and list three useful next tasks. Cite the files you used. Do not change files yet.
```

Watch the tool cards to confirm which files were read. If the Agent asks a structured question or requests approval, answer the waiting form or tool request. Review its file references before continuing with a concrete edit request.

For a first edit, name the desired result and how to verify it:

```text
Improve the README installation steps for this project. Check existing scripts first, keep commands runnable, and show the resulting diff and any checks you ran.
```

Inspect the changed-file panel and tool results. Continue with [conversations, files, and recovery](../conversations/).

## 4. Find the controls you need

| Task | Where to start |
| --- | --- |
| Open a project or another window | File menu |
| Change service, model, or default bindings | Agent → Models |
| Choose approval and execution boundaries | Agent → Execution & Permissions |
| Configure background tasks | Agent → Flash Tasks |
| Install a plugin or connect MCP | Integrations → Plugins / Extensions |
| Change language/theme or diagnostics | Edit → Settings → General |
| Report a reproducible failure | Help → Report a problem |

If sending stays unavailable or setup cannot finish, use [troubleshooting](../troubleshooting/). Keep your workspace and existing application data when diagnosing a failed setup; deleting history is not a connection repair step.
