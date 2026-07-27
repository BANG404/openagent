# OpenAgent SDK and transports

OpenAgent exposes one application contract through multiple transports. A
frontend selects a transport once and calls `OpenAgentClient`; product code does
not select Tauri commands, HTTP routes, or event sources.

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Runtime contracts | Private submodule `sdk/rust/openagent-runtime` | Versioned input, model-binding, interrupt, command-routing, and submission contracts without Tauri, provider, SQLite, or workspace dependencies |
| Application backend | Private submodule `sdk/rust/openagent-app` | Complete chat/flash Agent execution, Rig providers/tools, checkpoints, compaction, interrupts, Goal/Graph, persistence, and Tauri command adapters |
| Client SDK | Private submodule `sdk/typescript/src/client.ts` | Typed product methods and event projection used by desktop and web frontends |
| Tauri adapter | Private submodule `sdk/typescript/src/tauriTransport.ts` | Maps SDK operations/events to Tauri commands and events |
| HTTP adapter | Private submodule `sdk/typescript/src/httpTransport.ts` | Maps the same SDK operations to the authenticated Remote Gateway REST and SSE API |

The `sdk` Git submodule is hosted in the private `BANG404/openagent-sdk`
repository. Clone this repository with `--recurse-submodules`, or run
`git submodule update --init --recursive` before building. The public
application repository stores only the pinned SDK commit, not SDK source or
history.

The host package's Cargo library target points directly at the private
backend's `src/lib.rs`. Only thin desktop and backend-server binary entry
points remain under `src-tauri/src`; no Agent implementation is copied into
the host working tree.

GitHub Actions checks and release builds use the read-only
`OPENAGENT_SDK_DEPLOY_KEY` repository secret. Workflows do not expose that key
to pull requests originating from forks; SDK-dependent jobs are skipped for
those untrusted heads.

`OPENAGENT_PROTOCOL_VERSION` and `SDK_PROTOCOL_VERSION` must advance together
when a wire contract changes incompatibly. Additive optional fields do not
require a version increase.

## Transport capabilities

The shared cross-transport surface currently covers:

- raw Agent input, including canonical chat, `/goal`, `/graph`, and `/compact`
  routing;
- durable interrupt and approval recovery;
- conversation creation, listing, metadata updates, deletion, cancellation,
  history, branch selection, edit-and-fork, and file-change rollback;
- attachment upload, durable previews, and hash-verified blob repair;
- workspace-scoped file snippets, OS path opening, local media, and HTML
  preview assets used by the shared transcript components;
- chat streaming events for the desktop client;
- authenticated workspace, role, model, command-catalog, theme, and language
  projection for the remote gateway.

## Capability matrix

| Product capability | Tauri transport | HTTP transport |
| --- | --- | --- |
| Chat, `/compact`, `/goal`, `/graph` | Typed command | Authenticated run endpoint |
| Live response and terminal state | Typed Tauri events | Conversation-scoped SSE |
| Conversation create/list/update/delete/cancel | Typed commands | REST resources |
| Durable history, branch switching, edit-and-fork | Typed commands | Conversation history and branch endpoints |
| `ask_user`, approvals, direct render responses | Runtime interrupt commands | Interrupt resources using the same durable IDs |
| Attachment upload, preview, digest-verified repair | Local attachment commands | Authenticated attachment resources |
| File rollback, snippets, media, HTML, open path | Workspace commands | Conversation-scoped named capabilities and opaque asset grants |
| Workspace, role, model, command, theme, language discovery | Local state | Read-only authenticated projections |
| Browser-local links and downloads | OS opener/download commands | Browser UI capability; no controlled-PC side effect |
| Provider secrets, updater, tray, Inspector, unrestricted OS access | Explicit local bridge | Intentionally unavailable |

Presentation capabilities are named SDK operations. Tauri maps them to the
existing desktop commands; HTTP maps them to conversation-scoped routes. This
lets `MessageList`, AGUI file/media/HTML rendering, and tool-result cards use
one component tree without exposing a generic IPC-over-HTTP endpoint.

The desktop adapter additionally exposes an explicit local-capability bridge
through `invokeLocal`, `listenLocal`, and `emitLocal`. It is used for operating
system integration and development-only surfaces such as windows, updater
actions, tray control, locale plugins, and Inspector commands.
HTTP transports reject these calls instead of silently emulating privileged
desktop access.

## Runtime invariants

- `submit_agent_input` remains the single raw-input route. Adapters never choose
  chat, Goal, or Graph execution themselves.
- `CheckpointData.messages` and `CheckpointData.flow` remain the durable
  authorities. Transport events and SSE snapshots are projections only.
- Remote workspaces execute in their existing workspace process. The gateway
  forwards SDK requests through authenticated loopback IPC and never switches
  the primary process's global workspace.
- Long-running chat, Goal, and Graph submissions return `run_accepted` after
  dispatch. Immediate commands such as `/compact` return their canonical
  `immediate_command` outcome so clients cannot remain falsely pending when no
  checkpoint changes.
- HTTP authorization, CSRF, pairing, workspace allowlisting, request limits,
  and secure-cookie behavior belong to the HTTP adapter, not the runtime.
- Desktop-only capabilities must stay behind the local-capability bridge. A
  product operation needed by another frontend should be promoted to a typed
  `OpenAgentOperationMap` entry instead of teaching HTTP about Tauri commands.

## Adding a transport

1. Implement `OpenAgentTransport.request` and `subscribe`.
2. Map stable SDK operation and event names to the transport protocol.
3. Reject unsupported operations explicitly; do not add compatibility routing
   inside the frontend.
4. Preserve caller-provided conversation, branch, user-message, and assistant-
   message IDs.
5. Add contract tests for request mapping, event projection, authentication,
   disconnect handling, and unsupported capabilities.
