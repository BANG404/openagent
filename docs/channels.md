# Messaging channels

OpenAgent can accept Agent input from external messaging services. Channel
adapters enter through the same runtime facade as the desktop and therefore use
the normal conversation persistence, workspace permissions, model selection,
tools, and checkpoints. An adapter must not implement a separate Agent loop.

## WeChat

The desktop app supports direct-message access through the WeChat iLink Bot
protocol.

1. Open **Settings → General → WeChat Channel**.
2. Optionally enter allowed WeChat user IDs, one per line. Leave the list empty
   only when every user who can message the bot should be trusted.
3. Enable the channel and scan the displayed QR code with WeChat.
4. Keep an OpenAgent workspace active. Each WeChat user receives an independent
   durable conversation in that workspace.

The adapter supports text messages and voice messages when WeChat supplies a
text transcript. Replies longer than WeChat's message limit are split without
breaking Unicode characters. Image, file, group-chat mention, and interactive
approval forwarding are not currently supported.

Users can send these commands:

- `/new` starts another durable conversation.
- `/whoami` returns the iLink user ID used by the allowlist.
- `/help` lists channel commands.

Login credentials, poll cursors, recent-message IDs, and user-to-conversation
mappings are stored under `<OPENAGENT_HOME>/channels/wechat/`. They are never
projected through the shared runtime event stream. Selecting **Sign in again**
removes the cached login credential and requests a fresh QR code; conversation
mappings remain intact.

The adapter is disabled by default. An empty allowlist permits all direct
messages, so production use should populate it after discovering the intended
IDs with `/whoami`. The iLink protocol is an external compatibility boundary
and can stop working if WeChat changes its service.
