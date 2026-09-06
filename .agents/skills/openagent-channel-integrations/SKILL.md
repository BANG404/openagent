---
name: openagent-channel-integrations
description: Use for messaging channels or the remote gateway, including platform adapters, peer/workspace scoping, pairing, approvals, transport, and channel security.
metadata:
  category: integrations
---

# Channel integrations

Read only the matching reference:

- Platform adapters, commands, peer state, and channel persistence:
  [messaging-channels.md](references/messaging-channels.md)
- Paired browser gateway, sessions, CSRF, workspace allowlists, and SSE:
  [remote-gateway.md](references/remote-gateway.md)

Adapters enter through the shared SDK runtime and must not create a second
Agent loop or duplicate interrupt state. Keep desktop-only administration
local, treat workspace IDs as opaque at HTTP boundaries, and preserve the
different auth/session contracts for remote browsers and local runtime IPC.
