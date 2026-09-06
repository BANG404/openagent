---
name: openagent-update-delivery
description: Use for modular frontend, Runtime, SDK, or desktop-shell updates, supervised process replacement, activation barriers, rollback, or update protocol boundaries.
metadata:
  category: release-engineering
---

# Modular updates

Read [component-updates.md](references/component-updates.md) for the
development and published boundary matrix, Runtime supervisor contract,
frontend activation, rollback, and third-party reload behavior.

Route native process mechanics to `openagent-desktop-host`; route artifacts,
signatures, channels, and publication to `openagent-release-engineering`.
Never introduce a replaceable Rust dynamic library or a second durable-state
writer.
