# Development Runtime refresh

`bun run dev:desktop:source` starts Vite with the private Runtime source
watcher. Ordinary `bun tauri dev` uses the prepared public kit without watching
SDK paths; the public-development reference owns that preparation. Changes beneath `sdk/rust` or to the SDK Cargo manifest/lockfile
first rebuild and stage the debug `openagent-server`, then write an unwatched
pending stamp. Vite asks the mounted Tauri frontend to acquire the Runtime's
graceful component-update barrier. While an Agent is active, frontend HMR and
the Tauri reload stamp remain deferred without cancelling that execution. Once
the Runtime drains naturally, frontend changes use one full reload and Runtime
changes write the watched stamp that asks Tauri to rebuild and restart its host.
Standalone browser development retains ordinary Vite HMR. This ordering also
prevents a hot frontend or host from connecting to a stale sidecar that lacks a
newly added desktop operation. A failed server build leaves the currently
running development process intact and the next source change retries. The
explicit embedded diagnostic command does not use this sidecar path. Runtime,
embedded diagnostic, and sandbox-helper compilation stays under `sdk/target`;
the ordinary `bun tauri dev` launcher selects a separate external host target
directory derived from the worktree and `OPENAGENT_HOME`. Windows defaults to
`%LOCALAPPDATA%/OpenAgent/dev-targets/`; macOS uses
`~/Library/Caches/OpenAgent/dev-targets/`; Linux uses
`${XDG_CACHE_HOME:-~/.cache}/openagent/dev-targets/`.
`OPENAGENT_DEV_TARGET_ROOT` overrides that cache root; an explicit
`CARGO_TARGET_DIR` or custom runner remains authoritative. Direct host Cargo
checks and ordinary release builds retain `src-tauri/target` unless overridden.
Do not share private Runtime/compiler output with the public host cache.
