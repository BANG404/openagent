# Messaging channels

OpenAgent accepts Agent input from Feishu/Lark, Telegram, QQ, WeChat, Discord,
and Slack. Every adapter enters through the same runtime facade as the desktop,
so messages use normal conversation persistence, workspace permissions, model
selection, tools, and checkpoints. Adapters do not run a separate Agent loop.

Configure integrations under **Settings → Channels**. A workspace must be active
when a peer first contacts a channel. Each peer then keeps an independent durable
conversation plus its selected workspace, model, and role. Requests execute in
the selected workspace process, so one peer's selection does not change the
desktop or another peer. Credentials stay in the local configuration and
connection status is exposed only to the desktop settings surface.

The channel navigation starts directly with the platform list, without repeating
the Channels title inside the panel. Navigation artwork is rendered as a quiet,
monochrome identifier so competing brand palettes do not overpower the settings
hierarchy; the selected platform keeps its original artwork in the detail heading.
Connection state and the primary enable control share that heading, so enablement
does not become a detached form action. The bundled platform artwork is sourced
from Cherry Studio at commit `16e2905fd30fbfe21d1c58651574dcc939b6fb30`.

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
prevent response loops. Attachments, rich cards, reactions, and threads as
separate conversations are not currently supported.

Users can send:

- `/new` to start another durable conversation.
- `/model` to list models, `/model <number|provider/model>` to select one, and
  `/model default` to return to the configured default.
- `/workspace` to list workspaces and `/workspace <number|name|listed-path>` to switch.
  Switching workspace starts a new conversation in that workspace process.
- `/role` to list roles, `/role <number|name>` to switch, and `/role default` to
  restore the default OpenAgent identity. Switching role starts a new conversation.
- `/status` to show the peer's current workspace, model, and role.
- `/answer <value>` to answer `ask_user`; a single-field question also accepts a
  plain-text reply. Multi-field answers use `field=value; field=value`.
- `/approve` or `/deny` to resolve a pending manual tool approval, and `/cancel`
  to dismiss a pending `ask_user` request.
- `/whoami` to return the allowlist identity.
- `/help` to list channel commands.

Questions and approvals are reconstructed from the durable interrupted checkpoint
on the peer's selected conversation branch. Channel state does not maintain a
second pending-interrupt record, so repeated or stale replies are rejected after
the checkpoint advances. Approval still applies only to the exact tool call and
never widens the configured permission profile.

Conversation mappings and transport cursors are stored beneath
`<OPENAGENT_HOME>/channels/<platform>/`. WeChat additionally stores its local
login credential and recent-message state there. Selecting **Sign in again**
removes the cached WeChat login credential but retains conversation mappings.

The WeChat iLink protocol is an external compatibility boundary and can stop
working if WeChat changes its service.
