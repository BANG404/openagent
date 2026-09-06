---
name: openagent-chat-frontend
description: Preserve OpenAgent chat frontend behavior. Use for changes to MessageList, MessageInput, ToolCallCard, UserInputForm, FileChangeBanner, chatStream.ts, conversationDb.ts, checkpointTree.ts, transcript rendering, streaming/final reconciliation, restore/bootstrap, attachment previews, chat events, Mermaid tool rendering, or visible chat state.
metadata:
  category: frontend-development
---

# OpenAgent chat frontend

Keep streaming and durable turns as two representations of the same logical
transcript. Avoid remounts and UI state loss during reconciliation.

Read only the references that own the affected behavior:

- Cross-host boundaries and bootstrap ordering: [product-host-contract.md](references/product-host-contract.md)
- Transcript layout, streaming, finalization, branching, and Goal/Graph state: [transcript-streaming.md](references/transcript-streaming.md)
- Tool lifecycle, approvals, interrupts, pause/resume, and render tools: [tools-interrupts.md](references/tools-interrupts.md)
- Quotes, uploads, previews, message editing, and draft isolation: [attachments-editing.md](references/attachments-editing.md)
- Menus, selectors, composer palettes, shared interactive surfaces, and desktop navigation: [selectors-menus.md](references/selectors-menus.md)
- Bootstrap, onboarding, workspace switching, sidebar restore, and conversation creation: [startup-restore.md](references/startup-restore.md)
- Quick Chat plus browser-verifiable preview routes and Settings surface invariants: [quick-chat-previews.md](references/quick-chat-previews.md)
- SDK command boundaries, IPC, runtime events, diagnostics, configuration notifications, and completion notifications: [ipc-events.md](references/ipc-events.md)

## Verification

Treat this skill and its references as the living source of truth for chat
frontend behavior. Update the owning reference whenever a change alters a chat
invariant, and delete superseded guidance instead of appending history. Update
the closest owning skill reference as well when the product or architecture
contract changes.

Run `bun run check` and `bun run format:check`. For visible changes, verify
light/dark themes, Chinese and English copy, streaming-to-durable finalization,
reload, and branch switching. Run `bun run check:docs` before handoff. Keep
transcript imports aligned with rendered branches so removed UI states do not
survive as lint failures.
