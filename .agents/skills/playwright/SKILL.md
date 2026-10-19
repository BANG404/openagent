---
name: playwright
description: Verify OpenAgent browser-visible UI with the repository Playwright wrapper, pinned Chromium, isolated sessions and retained evidence. Use for frontend browser reproduction; native window behavior uses desktop-host and tauri-pilot.
metadata:
  category: browser-automation
---

# OpenAgent browser verification

Use this repository's wrapper for its pinned browser, persistent installation and isolated sessions. Generic browser tasks outside OpenAgent can use the global Playwright skill.

- For first-time browser preparation, launcher resolution or shell setup, read [installation](references/install.md).
- For repository UI verification, session isolation, snapshots and evidence, read [verification](references/verification.md).

Browser observations verify browser-visible behavior. Native window materials, startup and IPC require desktop-host's real-window scenario.
