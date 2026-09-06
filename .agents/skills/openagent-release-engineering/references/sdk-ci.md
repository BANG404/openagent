SDK release candidates are fully qualified by the public workflow before the
private repository creates their immutable `sdk-v*` tags. SDK release tags,
nightly schedules, and manual full dispatches use the public
`sdk-ci.yml` workflow so Rust, Harness, host-compatibility, and native
process-sandbox jobs remain publicly observable while trusted Linux, Windows,
and macOS work executes on standard GitHub-hosted runners. Full runs build the
four release Runtime targets once on that hosted platform matrix. Runtime
candidate construction starts after the immutable SDK revision is validated and
runs concurrently with capability qualification; publishing remains gated on
both successful qualification and every Runtime candidate. The private
publication workflow
waits for the exact status-linked public run to finish successfully, downloads
its one-day Runtime artifacts, and publishes those bytes without a second
private matrix build. Standard GitHub-hosted runners are the only execution path
for native host CI, release preparation, release builds, Store publication, and
release finalization.
Ordinary private `main` pushes do not run CI. Linux sandbox tests run on Ubuntu
24, install Bubblewrap, disable only
that image's AppArmor restriction on unprivileged user namespaces, and enable
the real filesystem boundary test; a dedicated macOS job exercises the system
Seatbelt boundary.
Both are required by the aggregate rather than being optional smoke checks.
The Windows job enables every Windows Firewall profile before exercising the
offline account. It verifies Codex's two network layers separately: after a
parent reachability preflight, the user-scoped Firewall rules block the same
numeric external HTTPS address, and the persistent WFP filters still block DNS
port 53 when ordinary local binding is allowed. Both the public SDK workflow
and the public host's complete native qualification run the same two exact
tests sequentially with detailed setup/wrapper logging enabled only in a Check
Run on the pinned private SDK commit. The host qualification accumulates its
helper build and Windows sandbox test output in the same runner-temporary SDK
log, records that allowlisted log only after a failure, and uses the same
least-privileged reporter App. Public logs retain only the fixed `firewall-*`
or `wfp-dns-*` diagnostic category; they never print, summarize, cache, or
upload the captured private output.
The private repository dispatches an immutable commit SHA; a GitHub App
installed only on the SDK repository lets the public workflow read that
revision and report the aggregate `Public SDK CI` commit status. Because
workflow logs are public, SDK command output is suppressed. The cross-repository
status reporter sends JSON payloads directly to the GitHub REST API, so SDK jobs
do not depend on a preinstalled GitHub CLI. Ordinary build
outputs are never uploaded. Runtime servers, embedded diagnostics, and sandbox
helpers compile cold into `sdk/target`; their Rust caches use
`cache-targets: false`. The ordinary Tauri dependency graph contains no private
SDK crate and compiles into the separate `src-tauri/target`, which may use
GitHub target caching. Release and development Runtime jobs may upload only
their documented short-lived distribution artifacts. Hosted workflows do not
configure a compiler cache.

Windows Harness Rust compilation runs under PowerShell so the MSVC linker takes
precedence over Portable Git's unrelated `link.exe`; later Bun package steps
may continue under Bash. Harness package-content verification uses
`bun pm pack --dry-run`, keeping package verification on Bun. Runner job
cleanup owns the resulting process lifetime. Windows sandbox helper discovery
retries Cargo metadata resolution and reports metadata failures separately from
a genuinely missing pinned helper package, so a transient proxy or registry
failure cannot be misclassified as dependency drift.
Public SDK Git operations force HTTP/1.1 so checkout transport does not depend
on HTTP/2 stability while fetching public or private revisions.
Only
generic pass/fail diagnostics or explicitly
allowlisted fixed-category test codes may appear in the public run. Linux and
Windows sandbox tests may expose fixed
`OPENAGENT_LINUX_SANDBOX_DIAGNOSTIC=[a-z-]+` and
`OPENAGENT_WFP_DIAGNOSTIC=[a-z-]+` categories so failed boundary stages can be
identified without revealing commands, paths, environment values, or private
source. When a capability command fails, it records the name of that command's
`sdk-*.log` file; the runner reads only that file from its temporary directory,
redacts values held in sensitive environment variables, limits the retained
output, and creates a failed `Public SDK diagnostics / <capability>` Check Run
on the private SDK commit. That Check Run contains the captured command output,
links back to its public runner invocation, and is visible only through the
private repository. If GitHub rejects the Check Run request, the public runner
may expose only the sanitized HTTP status and GitHub API message needed to
diagnose the delivery path; it must never expose the captured command output.
Arbitrary captured output must never be placed in public logs, step summaries,
artifacts, or caches.

The public repository stores the reporter App ID in
`OPENAGENT_CI_REPORTER_APP_ID` and its private key in
`OPENAGENT_CI_REPORTER_PRIVATE_KEY`; the App installation is limited to the
private SDK repository. Its repository permissions are limited to read-only
contents plus write access to commit statuses and checks. The status permission
owns the aggregate `Public SDK CI` gate, while the checks permission owns the
private failure diagnostics. The public workflow requests those three token
permissions explicitly so an App configuration drift fails at token creation
instead of silently producing a token that cannot deliver private diagnostics.

The private dispatcher forces every capability for release, nightly, and manual
runs with `full` selected. Manual runs can clear `full` to classify the requested
SDK commit against its first parent and dispatch only the affected Rust packages,
platform sandboxes, clients, Harness, and host compatibility. The input remains
enabled by default so older release callers that omit it still receive full qualification.
Fast and full results use separate SDK commit-status contexts so a later fast run
cannot replace the release qualification status. Rust formatting, lint, tests,
Linux/macOS sandbox checks, TypeScript SDK
checks, the Linux/Windows Harness matrix, and public-host compatibility remain
independent jobs. Public-host compatibility materializes the configured empty
`frontendDist` and a target-named placeholder for every configured Tauri
`externalBin` before native compilation; qualification never substitutes that
placeholder for the release-built Runtime sidecar. Frontend type checking remains
separate and does not need to produce a release build. Full development Runtime
publication installs `binutils`, `libcap-dev`, and `pkg-config` in every
Linux artifact job, then prepares the pinned, stripped Linux Bubblewrap helper
before the Linux server build, exports its SHA-256 to the compiler, and
publishes those helper bytes beside the server artifact. The SDK Release workflow waits for the
exact description `Public SDK full validation passed` before any build or
publish job. The host release coordinator reports metadata-only progress while
it waits across repositories, including workflow name, run URL, status, and the
immutable SDK revision or tag; it never forwards private SDK command output into
the public release log. GitHub's
failed-job rerun therefore repeats only failed capabilities and the aggregate
status. Dependency caches may hold Cargo registry/git data, Bun's public package
downloads, and ordinary Tauri target output after the default dependency graph
passes the private-SDK boundary check. Every SDK, server, embedded diagnostic,
and sandbox-helper Rust cache must set `cache-targets: false`; private target or
compiler outputs remain forbidden in public caches. A host-repository SDK gitlink update still selects
every public consumer capability because that repository cannot infer the
private path delta from the gitlink alone.
