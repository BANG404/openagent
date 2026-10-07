---
name: wait-for-pr-ci
description: Block on any GitHub Actions pull-request workflow until required or selected checks reach a final result, optionally continuing until merge. Use after opening or updating a PR when Codex must wait for branch-protection or ruleset checks, a named status/check, every Actions check on the current PR head, or an authoritative cross-repository status such as Public SDK CI, while keeping continuation attached to the same background cell instead of polling GitHub separately.
metadata:
  category: pr-and-ci
---

# Wait for PR CI

Run the bundled waiter after a PR update. Read
[wait.md](references/wait.md) for invocation, attached waits, and results.
