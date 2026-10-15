# Public SDK and pinned Runtime development

`sdk/typescript/` is public source owned by the host repository. The
`runtime/` gitlink pins the private `BANG404/openagent-sdk` repository; its
repository name, release tags, signed manifest names and `sdk_sha` fields remain
Runtime distribution identities. Never copy private Rust execution, prompts,
persistence, provider implementations or internal documentation into `sdk/`.
The reviewed public SDK file allowlist is `.githooks/public-sdk-sources.txt`.
Public Rust product, configuration and protocol source lives in `crates/`.
The private submodule declares `update = none`, so consuming public Git crates
and ordinary recursive clones never fetch the private repository. Explicit
source preparation overrides that default with `--checkout`.
Public preflight validates publication when the Runtime gitlink changes; an
unchanged pin inherits its baseline qualification and needs no private checkout.
Public native CI compiles App, configuration, protocol and Tauri without private
credentials. Private execution, sandbox and encoder qualification belongs to SDK CI.
Preflight and the pre-push hook reject unlisted files, symlinks and private
Runtime source in the public tree. Push verification also inspects immutable
commits from before the directory split using their historical SDK gitlink.

Every frontend build and launch resolves `@openagent/client` directly to
`sdk/typescript/src`, even when a cached development kit exists or source Runtime
mode is enabled. Frontend and automation CI need no private checkout, token or
client download. Root type checking, lint, formatting and affected Bun test
selection include the public SDK. SDK-only changes select frontend and
automation checks and a frontend release. Public contract tests keep the client and native
supervisor protocol constants aligned without private source; private Runtime gitlink changes retain
all Runtime consumer checks. Public source changes must not be hidden by an old
client snapshot from a signed kit.

Browser-only development needs `bun install --frozen-lockfile` and
`bun run dev:frontend`. Desktop development additionally needs a signed Runtime
kit matching `HEAD:runtime`, the platform's Tauri dependencies and Rust.
`bun run dev:prepare` resolves that gitlink without initializing `runtime/`,
downloads `runtime-dev-<full-runtime-sha>/sdk-dev-manifest.json`, verifies its
Tauri Minisign signature before parsing, and prepares only the exact Runtime
and current-platform helpers. `--release <product-tag>` selects a desktop kit;
it must match the source Runtime pin. `--manifest-url` selects a signed mirror
or fixture. Missing exact-SHA kits fail; never substitute a moving channel or
a different source revision.

Schema 2 retains its published client descriptor for distribution consumers.
Client archives are produced from the public host checkout, never from the
private repository's historical TypeScript snapshot. Local desktop preparation
and launch do not download, extract, import or execute that archive. Runtime
and helper descriptors retain safe filenames, byte lengths and SHA-256 values.
Downloads run concurrently, cache by digest and resume validated HTTP Range
transfers. Only verified complete executables enter the cache. Prepared files
remain ignored inputs, and launch rechecks signatures and executable bytes.

Admission reads `DESKTOP_RUNTIME_PROTOCOL_VERSION` from the checked-out native
supervisor; trusted development publication compares it with the exact private
Runtime contract before building. The signed Runtime manifest must agree with
the kit's source identity, protocol range and artifact descriptors. A valid
existing immutable kit remains canonical on retries.

`bun run dev:desktop` supervises prepared executables without watching private
source or compiling helpers. `bun run dev:desktop:source` explicitly enables
private source watching and rebuilding. OWT preparation initializes pinned
submodules and installs dependencies/resources; `--native` adds helper and
Runtime compilation. It does not materialize a second client copy.

The public Cargo manifests declare no private dependencies, even optional ones.
The private server pins all public Rust crates to one immutable host revision.
Changing those crates selects both shell and Runtime delivery: advance the
private dependency pin, qualify and publish the server, then update the host
gitlink. The signed development kit must match that final gitlink; a missing
exact-SHA kit fails until trusted SDK development publication produces it.

Qualification covers preparation without private source, no client archive
requests, stale cached-client isolation, source/protocol mismatch, tampering,
interrupted transfers and cache reuse. Private dispatcher source assertions skip
only when `runtime/` is absent; trusted Runtime qualification still runs them.
Named dev instances retain their data roots; ordinary debug runs use
`~/.openagent-dev`. Prepared release Runtime binaries receive that root explicitly.
