---
name: project-orientation
description: Read-only guide for understanding OpenAgent's architecture, ownership boundaries, repository layout, and the correct skill to use before editing.
metadata:
  category: project-understanding
---

# Project orientation

Use this read-only router to locate ownership. src/ is SvelteKit, src-tauri/ is
the thin host, sdk/ owns runtime behavior, and .agents/ owns contracts.
