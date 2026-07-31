---
name: openagent-chat-frontend
description: Preserve OpenAgent chat frontend behavior. Use for changes to MessageList, MessageInput, ToolCallCard, UserInputForm, FileChangeBanner, chatStream.ts, conversationDb.ts, checkpointTree.ts, transcript virtualization, streaming/final reconciliation, restore/bootstrap, attachment previews, chat events, Mermaid tool rendering, or visible chat state.
metadata:
  category: frontend-development
---

# OpenAgent chat frontend

Keep streaming and durable turns as two representations of the same logical
transcript. Avoid remounts and UI state loss during reconciliation.

## Transcript and streaming

- Completed messages and the active response share the dynamic-height virtual
  list.
- In responsive double-column mode, expanded process records participate in
  pagination instead of moving as one container. Keep the process header with
  its first record and preserve the same atomic break rules used by ordinary
  assistant content. Keep the completed-turn metadata and action footer outside
  column balancing as one full-width row below both columns.
- Position virtual rows without transform-promoted layers. CSS multi-column
  assistant content must not be nested in a forced compositor layer because it
  can flicker during WebView2 repaint invalidation.
- Disable per-record `content-visibility` for every message nested inside a
  double-column turn, including expanded process records. Viewport culling
  inside a fragmented column can repeatedly invalidate the trailing column at
  the viewport boundary.
- Use the backend-preallocated assistant message ID as the live row key.
  Streaming and durable forms must share the same assistant-turn branch and
  keyed stream-item children.
- Finalization updates the existing row instead of replacing its DOM subtree,
  preserving open thinking sections. Restored historical thinking starts
  collapsed.
- The application virtualizer owns tail following and above-viewport height
  correction; keep native browser anchoring disabled.
- After completion, reconcile the optimistic turn with its durable checkpoint
  in the background. Do not show the conversation-loading skeleton, remount an
  unchanged transcript, overwrite backend history, or remove optimistic
  messages from a queued turn.

## Tool and interrupt rendering

- Render durable `ask_user` calls with the dedicated input component, resolved
  by their matching ToolResult after streaming, reload, and branch switches.
- Group consecutive ordinary ToolCalls into one collapsed summary row with
  independently expandable calls.
- Keep `ask_user`, approvals, HTML previews, and other dedicated tools outside
  ordinary grouping.
- Render `render_mermaid` as a standalone virtual row from ToolCall source and
  restore it from the matching durable ToolResult.

## Attachments and editing

- Reuse one attachment preview component in composer and restored transcript.
- Restored previews load blob bytes on demand. Do not embed bytes in checkpoint
  IPC payloads.
- Removing a restored attachment is a staged edit: cancel restores it; send
  creates a new branch and preserves the original.
- Repair an app-managed pasted attachment only by checkpoint SHA-256 match.
  Missing external-file blobs require reselecting the original file and
  verifying the same SHA-256.

## Startup and restore

- Use the synchronous per-workspace restore hint only for first render, then
  reconcile through the unified bootstrap IPC.
- Persist a newly created conversation and active-workspace selection
  atomically before its first turn.
- Keep the main window hidden until the bootstrap snapshot is applied; retain
  the failure watchdog.
- Use transcript-shaped and composer skeletons during history loading.
- An explicitly empty durable active-conversation marker restores the centered
  new-conversation surface, even when older conversations exist. Never fall
  back to the newest conversation.
- Do not render approval controls for a switched branch until its active tip is
  durable.

## Quick chat

- The Raycast-style quick chat is a presentation mode of the primary window,
  not a second chat client. It must reuse the active conversation, optimistic
  messages, backend-preallocated assistant ID, stream items, queue, composer
  draft, model binding, role selection, and workspace state owned by the page
  shell.
- Entering quick chat may resize, center, and temporarily pin the primary
  window, but closing it must restore the prior size, position, maximized state,
  and visibility. Opening the full application from quick chat restores the
  same geometry while forcing the window visible.
- Role and workspace changes from quick chat deliberately start from the same
  durable boundaries as the full application: changing a role selects a new
  conversation surface, while changing a workspace restores that workspace's
  active durable surface. Never maintain quick-chat-only conversation history.
- Keep the development-only `quick-chat-preview` query available for browser
  layout verification; it must not register shortcuts or emulate native
  window behavior outside Tauri.

## IPC and events

- Keep Rust event payloads aligned with `src/lib/types.ts`.
- `chat-response-started` means the stream connected, not that content arrived.
  Clear transient waiting state on the first text/thinking chunk and every
  terminal path.
- Treat `chat-mermaid-render-request` as automatic frontend-assisted tool
  execution. Render with the shared Mermaid engine and return its structured
  result through `submit_interrupt_response`.
- Extend streamed formats only through `src/lib/streamdown/`.

## Verification

Treat this skill as the living source of truth for chat frontend behavior.
Whenever a change alters a transcript, composer, tool, streaming,
reconciliation, restore, attachment, event, or streamed-content invariant,
update the corresponding instruction here in the same change. Record the
resulting invariant and delete superseded guidance instead of appending a
changelog. Update `docs/` as well when the public product or architecture
contract changes.

Run `bun run check` and `bun run format:check`. For visible changes, verify
light/dark themes, Chinese and English copy, streaming-to-durable finalization,
reload, and branch switching. Run `bun run check:docs` before handoff.
