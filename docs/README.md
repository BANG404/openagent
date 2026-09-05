# Documentation map

Public product and architecture contracts stay in this directory. Agent
procedures and focused reading routes live in `.agents/skills/`, so an agent can
load only the topic needed for a task instead of the entire documentation set.

| Topic | Public contract | Agent skill |
| --- | --- | --- |
| Configuration and durable data | [configuration.md](configuration.md) | [openagent-configuration](../.agents/skills/openagent-configuration/SKILL.md) |
| Visual language and `DESIGN.md` | [design.md](design.md), [designmdrefer.md](designmdrefer.md) | [openagent-design-system](../.agents/skills/openagent-design-system/SKILL.md) |
| Messaging and remote gateway | [channels.md](channels.md), [remote-gateway.md](remote-gateway.md) | [openagent-channel-integrations](../.agents/skills/openagent-channel-integrations/SKILL.md) |
| Agent Plugins | [agent-plugins.md](agent-plugins.md) | [openagent-plugin-development](../.agents/skills/openagent-plugin-development/SKILL.md) |
| Headless Harness | [harness-sdk.md](harness-sdk.md) | [openagent-harness-sdk](../.agents/skills/openagent-harness-sdk/SKILL.md) |
| Modular updates | [modular-updates.md](modular-updates.md) | [openagent-update-delivery](../.agents/skills/openagent-update-delivery/SKILL.md) |
| Embedding resources | [embedding-model.md](embedding-model.md) | [openagent-embedding-resources](../.agents/skills/openagent-embedding-resources/SKILL.md) |
| Windows development | [windows-development.md](windows-development.md) | [openagent-windows-development](../.agents/skills/openagent-windows-development/SKILL.md) |
| Release workflow | [release.md](release.md), [release/](release/) | [openagent-release-engineering](../.agents/skills/openagent-release-engineering/SKILL.md) |

Read the public contract when changing user-visible behavior. Read the skill
entrypoint first for implementation routing, then only its matching reference.
