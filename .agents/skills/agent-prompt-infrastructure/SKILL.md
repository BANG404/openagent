---
name: agent-prompt-infrastructure
description: Use when changing agent prompt assembly, skill discovery, skill routing metadata, agent-facing documentation validation, memory or role injection, or prompt observability contracts.
metadata:
  category: agent-infrastructure
---

# Agent prompt infrastructure

Keep prompt composition in the private Runtime; this workspace owns skill routing and documentation validation.
Read [prompt and routing contracts](references/prompt-contract.md) for metadata, ownership, discovery or documentation-gate changes.
Run `bun run check:skills` after changing a skill or the manifest.
