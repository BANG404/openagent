# Development Runtime refresh

`bun run dev:desktop:source` starts Vite with the private Runtime source
watcher. Ordinary `bun tauri dev` uses the prepared public kit without watching
SDK paths; the public-development reference owns that preparation. Changes beneath `sdk/rust` or to the SDK Cargo manifest/lockfile
first rebuild and stage the debug `openagent-server`, then write an unwatched
pending stamp. Debug preparation writes an immutable image
under `.cache/development-runtime/<target>/<sha256>/` and publishes the selection
beside the fixed sidecar only after staging completes. Preparation stages platform
sandbox helpers under the image's adjacent `codex-resources`; helper failures
also leave the selection unchanged. The debug host verifies
that digest and launches the immutable image, so Windows never needs to overwrite
a running EXE before requesting its restart. A locked legacy fixed image may
remain until restart; it is not the selected candidate. Release staging still
requires the exact fixed sidecar bytes. Invalid selections fail explicitly.
Vite handles both new and changed pending files and reoffers an unconsumed stamp
until the mounted frontend acknowledges it, including after reconnect/startup.
The barrier regression waits for observable offers with a bounded deadline;
startup and watcher notifications must not depend on a fixed I/O grace period.
Vite asks the mounted Tauri frontend to acquire the Runtime's
graceful component-update barrier. While an Agent is active, frontend HMR and
the Tauri reload stamp remain deferred without cancelling that execution. Once
the Runtime drains naturally, frontend changes use one full reload and Runtime
changes write the watched stamp that asks Tauri to rebuild and restart its host.
Standalone browser development retains ordinary Vite HMR. This ordering also
prevents a hot frontend or host from connecting to a stale sidecar that lacks a
newly added desktop operation. A failed server build leaves the currently
running development process intact and the next source change retries. The
explicit embedded diagnostic command does not use this sidecar path. Embedded
diagnostic compilation stays under `sdk/target`. Private source
development Runtime and Windows-helper builds use
`<host-common-git-directory>/openagent-source-target/<platform>` so related OWT
worktrees reuse Cargo dependency output. Cargo still checks the current source,
lockfile, compiler and flags; this is not a prebuilt Runtime qualification.
The source-build lock covers compilation and copying the output, preventing a
second worktree from replacing bytes before the first stages them. An interrupted
owner leaves a PID-bearing lock; inspect that process before manually removing
only its stale lock. Shared builds serialize. Set `CARGO_TARGET_DIR` to a dedicated
absolute directory when parallel isolated compilation is required. Explicit
overrides are authoritative; relative overrides resolve from the host checkout.
Windows uses explicit target triples and `CARGO_INCREMENTAL=0` for Runtime,
helpers and the test wrapper to avoid ReFS cleanup failures and differing
dependency build modes. Release defaults remain under the checkout's `sdk/target`,
and release qualification does not consume this development cache. Linux sandbox
preparation retains its existing dedicated helper output. The SDK embedded
diagnostic and public host output are separate from this private cache;
the ordinary `bun tauri dev` launcher selects a separate external host target
directory derived from the worktree and `OPENAGENT_HOME`. Windows defaults to
`%LOCALAPPDATA%/OpenAgent/dev-targets/`; macOS uses
`~/Library/Caches/OpenAgent/dev-targets/`; Linux uses
`${XDG_CACHE_HOME:-~/.cache}/openagent/dev-targets/`.
`OPENAGENT_DEV_TARGET_ROOT` overrides that cache root; an explicit
`CARGO_TARGET_DIR` or custom runner remains authoritative. Direct host Cargo
checks and ordinary release builds retain `src-tauri/target` unless overridden.
Do not share private Runtime/compiler output with the public host cache.
