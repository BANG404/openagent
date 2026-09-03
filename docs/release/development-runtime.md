# Development Runtime refresh

Ordinary `bun tauri dev` starts the Vite server together with a private Runtime
source watcher. Changes beneath `sdk/rust` or to the SDK Cargo manifest/lockfile
first rebuild and stage the debug `openagent-server`; only changed server bytes
write the watched reload stamp that asks Tauri to rebuild and restart its host.
This ordering prevents a hot frontend or host from connecting to a stale sidecar
that lacks a newly added desktop operation. A failed server build leaves the
currently running development process intact and the next source change retries.
The explicit embedded diagnostic command does not use this sidecar path.
