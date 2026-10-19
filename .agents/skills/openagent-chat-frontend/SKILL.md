---
name: openagent-chat-frontend
description: Preserve OpenAgent chat frontend behavior. Use for changes to MessageList, MessageInput, ToolCallCard, UserInputForm, FileChangeBanner, chatStream.ts, conversationDb.ts, checkpointTree.ts, transcript rendering, streaming/final reconciliation, restore/bootstrap, attachment previews, chat events, Mermaid tool rendering, or visible chat state.
metadata:
  category: frontend-development
---

# Chat frontend

Keep the shared SDK client as the input boundary and preserve live/durable conversation ownership.
Read only the contracts needed for the affected behavior.

| Task | Read |
| --- | --- |
| Transcript projection, streaming and final reconciliation | [Transcript and streaming](references/transcript-streaming.md) |
| Conversation components and input queue | [Conversation UI](references/conversation-ui.md) |
| Shared frontend types and product integrations | [Shared contracts](references/plugin-contract.md) |
| Startup, hydration and conversation restore | [Startup and restore](references/startup-restore.md) |
| Host/client composition and settings handoff | [Product-host contract](references/product-host-contract.md) |
| SDK events and lifecycle projections | [IPC and events](references/ipc-events.md) |
| Attachments and editing | [Attachments](references/attachments-editing.md) |
| Tool cards, approvals and interrupts | [Tools and interrupts](references/tools-interrupts.md) |
| Selectors, menus and composer controls | [Selectors and menus](references/selectors-menus.md) |
| Plugin sidebar scope and activation | [Plugin sidebar](references/plugin-sidebar.md) |
| Quick chat and preview windows | [Quick chat](references/quick-chat-previews.md) |
| Resource use, large transcripts and cache evaluation | [Performance](references/conversation-performance.md) |
| Verification route and scenario selection | [Testing workflow](references/testing-workflow.md) |

For visual changes, also use the design-system owner. Native verification setup belongs to desktop-host.
