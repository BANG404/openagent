---
name: openagent-desktop-host
description: Preserve OpenAgent's thin Tauri host and native desktop behavior. Use for src-tauri changes, native windows or materials, single-instance handling, Tauri IPC and events, startup integration, or native-shell verification.
metadata:
  category: desktop-development
---

# OpenAgent desktop host

Keep `src-tauri` a product adapter over the private SDK, not a second
runtime. Read `sdk/AGENTS.md` before changing the SDK side of any
boundary. Do not load replaceable Rust dynamic libraries. Runtime
extraction uses a verified, supervised process with a versioned transport
contract, fallback binary, and exclusive durable-state ownership.

## Read the right reference

Open only the references that own the affected behavior:

- Runtime supervisor, IPC contracts, and asset protocols:
  [references/ownership.md](references/ownership.md)
- Startup, single instance, activation, and window management:
  [references/startup-windows.md](references/startup-windows.md)
- Native material, theme tint, and debug automation:
  [references/native-material.md](references/native-material.md)
- Native-shell verification routing:
  [references/native-verification.md](references/native-verification.md)

## Verification

Keep host Rust warning-free: native quality treats compiler and Clippy
warnings as errors, so behavior-preserving refactors must use the idioms
required by the configured toolchain. When a toolchain update introduces a
style-only lint, adopt the current expression or borrowing form instead of
suppressing the warning. Use the workspace `playwright` skill when the
behavior is completely reproducible in a browser.
