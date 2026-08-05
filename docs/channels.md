# Messaging channels

OpenAgent accepts Agent input from Feishu/Lark, Telegram, QQ, WeChat, Discord,
and Slack. Every adapter enters through the same runtime facade as the desktop,
so messages use normal conversation persistence, workspace permissions, model
selection, tools, and checkpoints. Adapters do not run a separate Agent loop.

Configure integrations under **Settings → Channels**. A workspace must be active
while a channel is running. Each external peer receives an independent durable
conversation in that workspace. Credentials stay in the local configuration and
connection status is exposed only to the desktop settings surface.

The channel navigation identifies each messaging platform with its recognizable icon
and starts directly with the platform list, without repeating the Channels title
inside the panel. The bundled platform artwork is sourced from Cherry Studio at
commit `16e2905fd30fbfe21d1c58651574dcc939b6fb30`.

## Platform setup

| Platform | Required configuration | Receive transport | Allowlist identity |
| --- | --- | --- | --- |
| Feishu / Lark | App ID, App Secret, service region | Official long connection | Chat ID |
| Telegram | Bot token from BotFather | Bot API long polling | Chat ID |
| QQ | QQ Open Platform App ID and Client Secret | Official bot gateway | User ID |
| WeChat | QR sign-in | iLink Bot polling | iLink user ID |
| Discord | Bot token; enable Message Content intent | Gateway v10 | Channel ID |
| Slack | Bot User OAuth token and an App-Level token with `connections:write`; enable Socket Mode and message events | Socket Mode | Channel ID |

For Feishu/Lark, subscribe the app to message events and grant message read/send
permissions before enabling the channel. For Slack, the bot token normally needs
`chat:write`, and the app must subscribe to the message events it should receive.
Platform administration and installation are still required: saving credentials
in OpenAgent does not install a bot into a workspace, guild, or organization.

Allowlist entries are exact IDs, one per line. An empty list permits every peer
that can reach the bot, so populate it for production use. Send `/whoami` from a
new peer to discover the identity used by the adapter, then add that ID and save
settings. Credential or enablement changes restart only the affected adapter.

## Message behavior

Text messages are supported. Replies are split on Unicode character boundaries
to respect each platform's message limit. Bot-authored messages are ignored to
prevent response loops. Attachments, rich cards, reactions, threads as separate
conversations, and interactive approval forwarding are not currently supported.

Users can send:

- `/new` to start another durable conversation.
- `/whoami` to return the allowlist identity.
- `/help` to list channel commands.

Conversation mappings and transport cursors are stored beneath
`<OPENAGENT_HOME>/channels/<platform>/`. WeChat additionally stores its local
login credential and recent-message state there. Selecting **Sign in again**
removes the cached WeChat login credential but retains conversation mappings.

The WeChat iLink protocol is an external compatibility boundary and can stop
working if WeChat changes its service.
