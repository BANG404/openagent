# Development Runtime refresh

Ordinary `bun tauri dev` starts the Vite server together with a private Runtime
source watcher. Changes beneath `sdk/rust` or to the SDK Cargo manifest/lockfile
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
explicit embedded diagnostic command does not use this sidecar path.
