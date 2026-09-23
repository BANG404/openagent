---
name: agent-prompt-infrastructure
description: Use when changing agent prompt assembly, skill discovery, skill routing metadata, agent-facing documentation validation, memory or role injection, or prompt observability contracts.
metadata:
  category: agent-infrastructure
---

# Agent prompt infrastructure

Use [prompt-contract.md](references/prompt-contract.md) as the source of truth
for prompt layers, authority, trust boundaries, and skill routing. Keep runtime
prompt assembly in the private SDK; keep repository routing and validation in
this workspace.

Run `bun run check:skills` after changing a workspace skill, its metadata, or
the routing manifest. The validator checks skill entrypoints, relative
references, and the primary-owner manifest.

## Ownership

- Runtime prompt composition and provider projections belong to `sdk/`.
- Workspace skill metadata and repository routing belong to `.agents/skills/`.
- Public product explanations belong in `README.md` or `README.zh-CN.md`.
- A behavior has one primary documentation owner; related skills are secondary
  contracts or verification owners and must not duplicate the full rule.
