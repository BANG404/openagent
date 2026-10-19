---
title: Host Bridge workflows
description: Build conversation-aware orchestration with shared public capabilities and package-owned state.
---

Goal, Graph, and Chat Groups combine ordinary commands, MCP tools, hooks, and views. Their domain rules live in their own packages. The Runtime supplies conversation persistence, Agent execution, cancellation, permissions, and branch bookkeeping through a shared Host Bridge.

## Choose a reference by behavior

| Reference package | Study it for |
| --- | --- |
| [Goal](https://github.com/BANG404/openagent-goal) | Bounded continuation, completion, cancellation, and recovery |
| [Graph](https://github.com/BANG404/openagent-graph) | Dependency scheduling, parallel workers, branch projections, and progress views |
| [Chat Groups](https://github.com/BANG404/openagent-chat-groups) | Package-owned membership, roles, mentions, and wake routing |
| [Message Board](https://github.com/BANG404/openagent-message-board) | Persistent collaboration records and scoped views |
| [Plugin Developer](https://github.com/BANG404/openagent-plugin-kit) | Validation, testing, isolated Runtime acceptance, and developer acceptance |

Read each package's `plugin.json`, command entry, MCP server, state module, and UI together. Record the source revision you studied; these repositories release independently. Multi-Agent V2 is a Runtime capability, while these packages add workflows through public operations.

## Bundle the public client

Copy `lib/openagent-host.mjs` from the public Plugin Kit into your package, preserving its license. For `server/index.mjs`, placing it at `server/openagent-host.mjs` makes this import self-contained:

```js
import { createPluginHost, requireConversationContext } from './openagent-host.mjs';

const host = createPluginHost();

async function startWorker(toolArguments) {
  const { conversationId } = requireConversationContext(toolArguments);
  const child = await host.conversation.create({
    title: 'Notes reviewer',
    parent_conv_id: conversationId,
  });
  await host.agent.wake(
    { conv_id: child.conv_id, branch_id: child.branch_id, text: 'Review project decisions and report unresolved questions.' },
    { wait: false },
  );
  return { conversationId: child.conv_id, branchId: child.branch_id };
}
```

Call this from a validated MCP handler. The host supplies `OPENAGENT_PLUGIN_HOST_URL`, `OPENAGENT_PLUGIN_HOST_TOKEN`, and `OPENAGENT_PLUGIN_ID` to enabled package processes; the client handles authentication. Never hardcode, expose to an iframe, or persist these tokens. This process client does not run inside sidebar HTML.

Use `{ wait: false }` for work that can outlast the bridge request timeout. A successful wake acknowledges scheduling, not task completion. Retain the child IDs in `PLUGIN_DATA`, inspect `host.conversation.state(childId, branchId)`, and wait for a terminal result before scheduling dependents.

## Keep state and branches explicit

Persist your own state schema, task budget, dependency status, and recovery decisions. Scope workflow records by conversation **and branch**. For continuations, pass the saved `branch_id` with a null or omitted `parent_checkpoint_id`; the host resolves that branch's current head when submitting. Do not silently read the selected branch when resuming work on another one.

Use `conversation.flow.set` for an opaque package-owned branch projection. It lets the host carry progress through checkpoints without interpreting your domain state. The host does not implement plugin reducers or completion criteria. Follow the [client reference](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/host-bridge.md) for exact operation arguments, hook context, and error handling.

Combine this with the [Stop phase rules](../commands/#handle-completion-and-cancellation): deduplicate by execution ID, bound retries and iterations, and preserve approval/cancellation decisions. Test a slow child, a failed dependency, reload, a sibling branch, and cancellation before reporting completion.

## Discover optional capabilities

`host.call('runtime.plugin_contract')` returns the active `plugin_protocol` and supported `features`. Handle an unsupported-operation response on older Runtimes. Declare mandatory features in `compatibility.features` so admission fails before code executes; probe genuinely optional operations and keep a usable fallback.

For example, call `host.conversation.ui.capabilities()` before writing conversation UI, or `host.embedding.status()` before local embedding. A supported but unprepared model is different from an unsupported operation; neither case authorizes sending data to another service. Shared host operations keep private SDK code out of your package.

## Keep observation opt-in

Normal hook and sidebar context does not expose the whole transcript. Packages requiring the bounded Stop observation projection declare both `conversation-observations-v1` and `configuration-v1`, plus a version-one `conversation_observations` extension tied to a boolean configuration consent field that explicitly defaults to `false`. Only an explicitly saved `true` permits that package's observation.

Use separate capture/upload switches and keep them off by default. Do not scrape application databases or diagnostics to fill missing context. See the public [observation format](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md#conversation-observations) before implementing capture, revocation, and bounded export.
