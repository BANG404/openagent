# Pinned public development kits

Public frontend and desktop development must not require access to the private
SDK repository. Keep `master` as the integration branch; immutable product tags
are the reproducible public source baseline. A source revision is publicly
developable only when its pinned SDK client, Runtime, and required platform
helpers have an immutable signed kit. Never substitute a moving channel or a
different SDK commit when that kit is unavailable.

`bun run dev:prepare` resolves the source gitlink without initializing `sdk/`,
downloads `runtime-dev-<full-sdk-sha>/sdk-dev-manifest.json`, verifies its Tauri
Minisign signature before parsing, and prepares the exact public client and
current-platform executables. `--release <product-tag>` selects a desktop kit
explicitly; it must still match the checked-out source's client SDK SHA.
`--manifest-url` permits an explicitly selected signed mirror or fixture.
Prepared bytes live in ignored `.cache/` and Tauri resource inputs, never Git.

Schema 2 binds the exact client `sdk_sha`, Runtime source/version/protocol and
platform artifacts, and Windows/Linux helper descriptors. A release may reuse
a qualified ancestor Runtime only through this explicit source-to-Runtime
mapping. Every descriptor has a safe filename, byte length and SHA-256. Helpers
come from the same pinned Codex input as that Runtime. The TypeScript snapshot
contains only contracts and transport adapters; do not publish an npm package
or private execution sources, diagnostics, credentials or build caches.

Downloads run concurrently, cache by digest, persist incomplete transfers and
resume with validated HTTP Range responses. Only complete verified bytes enter
the immutable cache. Install the client from a bounded USTAR archive; reject
traversal, duplicate paths, symlinks and unsupported entries. Persist the source,
manifest location, target and artifact identities in the local lock file.

`bun run dev:frontend` uses the prepared client via `@openagent/client`.
`bun run dev:desktop` supervises the prepared Runtime without watching private
sources or compiling platform helpers. The source watcher belongs only to
`bun run dev:desktop:source`, whose explicit environment also selects the local
source client. OWT preparation initializes private source and builds helpers;
use the explicit source command to launch that development environment.

The public Cargo manifest declares no private SDK dependencies, including
optional ones: Cargo resolves optional path dependencies even when disabled.
Explicit embedded diagnostics generate a separate manifest under
`sdk/target/desktop-host/`; their private dependencies never enter the public
host's lockfile or ordinary dependency resolution.
The diagnostic workspace copies native locales and combines the host and SDK
lock inputs; unchanged inputs retain Cargo's resolved diagnostic lock. Its target
must remain below `sdk/target/desktop-host/` for native locale discovery.

Qualification must exercise signed preparation in a directory with no `sdk/`,
wrong-SHA rejection, tampered manifests/artifacts, bounded extraction, interrupted
download recovery, cache reuse, and a native launch with the prepared Runtime.
Trusted qualification publishes immutable full-SHA kits before refreshing the
moving `runtime-dev` discovery channel. Fork frontend checks consume the exact
immutable client snapshot instead of the latest moving channel.

Frontend-only contributors can run frontend and host contracts without private
source. Private Runtime dispatcher/descriptor source assertions skip
only when their SDK files are absent; trusted SDK qualification still runs them.
The public client archive and every extracted client file are reverified before execution so
editing a cached TypeScript file cannot silently alter the prepared contract.
Named dev instances retain their own data root; only an ordinary dev run defaults
to `~/.openagent-dev`. Release-built Runtime binaries always receive that explicit
root from the dev launcher rather than choosing installed release data themselves.
