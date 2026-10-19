# Public npm SDK and standalone Runtime

Software Beta/RC/Stable releases coordinate one npm package,
`@bang404/openagent-sdk`, and public fixed Runtime kits. Alpha and development-kit
publication do not publish npm. Client SDK, Runtime, protocol and desktop versions
are independent identities.

## Candidate and version selection

`client-sdk-release.mjs` consumes the exact qualified, signed desktop Runtime
candidate. It checks every binary/helper descriptor, normalizes away desktop
installation metadata, and creates a standalone manifest. Its content digest
selects `runtime-v<runtime-version>-<digest-prefix>`. Identical execution and helper
bytes reuse that public identity across software releases. No new Runtime build
occurs. Changes to helpers produce a different kit even at the same binary version.
The candidate job signs the normalized manifest with the existing update key.

The npm candidate includes compiled ESM and declarations, optional Tauri peers,
the default browser-safe entry and the Node/Bun-only `/runtime` entry. Runtime
version, source SHA, protocol, immutable manifest URL and full manifest digest are
embedded in the tarball. No install/postinstall downloads or execution occur.
Source archives retain their separate buildable-snapshot contract.

The candidate compiler resolves TypeScript from the SDK package using Node module
resolution, supporting both the root frozen dependency install used by host CI
and an independent SDK install. Never assume an SDK-local `node_modules` tree.

Source/package/build inputs and recommended Runtime identity determine the SDK
fingerprint. Reuse an already published identical fingerprint in the requested
channel; otherwise choose an independent SemVer at or above the checked-in SDK
version floor. Increment Beta/RC sequence, or advance the patch after an existing
stable base. Raise the checked-in version floor for intentional API minor/major
changes. Registry failures fail planning; only HTTP 404 means unpublished.
Moving npm tags select `beta`, `rc`, or Stable's `latest` and never select binaries
at runtime. Retries verify existing npm fingerprints and Runtime signed payloads;
they cannot overwrite an immutable version. A channel promotion may build a new
package version over the same fixed Runtime kit.
Interrupted Runtime drafts resume by verifying existing assets and uploading only
missing files. Conflicting bytes or an incomplete already-public kit fail without
replacement. Publication also checks the qualified tarball digest before any write.

## Qualification and publication

Before tagging the software, qualify the actual npm tarball with an external
Node consumer on Linux x64, Windows x64 and both macOS architectures. Install it
with lifecycle scripts disabled, import the public/default and Runtime entries,
start the matching qualified real binary with an isolated data root, perform an
authenticated product request and stop it. This supplements full Runtime and
desktop qualification. No model/provider credentials are required.

After software publication prerequisites and private Runtime publication pass,
`publish-client-sdk` first publishes and verifies the standalone public Runtime,
then publishes the npm tarball with provenance. Only then may the desktop Release
become public and its moving channels advance. Upload `release.json` to the
desktop draft as the SDK/Runtime mapping. npm and GitHub are not an atomic
transaction: a failed npm publication can leave an available Runtime; retry the
same candidate. Never unpublish or replace a successful npm version on failure.

Configure npm trusted publishing for owner `BANG404`, repository `openagent`,
workflow `release.yml`, allowing direct publication. The GitHub-hosted publish
job grants `id-token: write` and uses Node 24/npm 11.5.1 or newer. The scope must
be owned by the maintainer. Initial package bootstrap may require the repository
secret `NPM_TOKEN`; after trusted publishing is established OIDC requires no
long-lived npm token. Missing publication authority fails the release rather
than silently skipping its npm deliverable.

## Consumer admission

`ensureRuntime()` uses only the embedded recommendation or an explicit release;
it verifies Minisign before parsing, the pinned manifest digest and identities,
the SDK protocol and all executable/helper hashes. Installed kits are immutable,
published as complete trees, and reverified offline before reuse. Linux's helper
is installed as `codex-resources/bwrap`. Concurrent installs use private staging
and accept another installer only after byte verification. Corrupt existing kits
fail explicitly without modifying a running executable.

`startRuntime()` requires an explicit workspace and application-specific home.
Run read-only bootstrap inspection first; any transition/reset, plugin admission
or policy decision requiring host action refuses startup. The SDK never applies
destructive data transitions, updates running binaries or shares desktop state
implicitly. Supervision uses the existing stdin shutdown/owner-loss protocol,
private environment bearer token, bounded readiness, loopback-only endpoint,
protocol/version checks and health PID confirmation. Compatible existing binaries
may be selected explicitly; supported versions start at the recommendation and
stay within its Runtime major. Source builds without a recommendation still
require the exact SDK protocol. Caller-supplied executables are explicitly trusted.

`connectRuntime()` accepts the existing owner's readiness record and token and
does not own that process. The current health endpoint confirms PID/status; it
does not advertise protocol or version. Never invent those facts from a health
response. Local requests and SSE use bearer authentication and never pair a
browser session. Remote browsers continue using `HttpTransport` and gateway policy.
