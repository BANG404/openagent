---
name: openagent-desktop-host
description: Preserve OpenAgent's thin Tauri host and native desktop behavior. Use for src-tauri changes, native windows or materials, single-instance handling, startup integration, native-shell verification, or bundled embedding-resource provenance and repair.
metadata:
  category: desktop-development
---

# Desktop host and resources

Keep Tauri a thin adapter. Start with [product/Runtime boundaries](references/product-runtime-boundary.md) when changing ownership.

| Task | Read |
| --- | --- |
| Host modules, commands and supervision | [Ownership](references/ownership.md) |
| Startup reveal, utility windows and geometry | [Startup windows](references/startup-windows.md) |
| Native materials and transparent canvases | [Native material](references/native-material.md) |
| CPU, memory and process sampling | [Process resources](references/process-resources.md) |
| Bundled embedding model, checksums, repair and plugin inference | [Embedding resources](references/model-provenance.md) |
| Isolated real-window verification and scenario selection | [Native verification](references/native-verification.md) |

For update transactions use update-delivery; for release packaging use release-engineering. Delivery follows the repository delivery skill.
