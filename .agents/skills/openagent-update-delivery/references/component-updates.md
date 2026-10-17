# Modular frontend and SDK updates

Runtime admission also evaluates the independent signed
[compatibility policy](../../openagent-configuration/references/compatibility-policy.md).
Online replacement passes the actual running source version to the candidate
before stopping it. Policy restart/block decisions augment the existing local
protocol, data-transition and rollback gates; they cannot authorize migration.

OpenAgent separates development reloads and reusable SDK delivery from desktop
installer updates. The separation is process- and protocol-based; the Rust SDK
is never loaded as a replaceable dynamic library.

Alpha desktop versions select independent `alpha`, `frontend-alpha` and
`runtime-alpha` channels. They never fall through to Beta. Windows Alpha
packaging and qualification belong to the release owner's
[Alpha reference](../../openagent-release-engineering/references/alpha-releases.md).

## Supported boundaries

| Surface                 | Development                            | Published delivery                                                                          | Activation                                                |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Frontend                | Vite HMR through `bun tauri dev`       | Signed `frontend-beta`, `frontend-rc`, or `frontend-stable` resource                        | Confirmed WebView reload with rollback                    |
| Desktop Runtime sidecar | Rebuild and restart `openagent-server` | Signed Runtime channel or versioned SDK release binaries plus `openagent-sdk-manifest.json` | Supervised drain, restart, probe, reconnect, and rollback |
| Cua Driver              | Installed Agent Plugin package         | GitHub `openagent-cua-driver` release archive with published SHA-256 digest                 | Activate through the normal plugin updater                |
| Desktop native shell    | Tauri rebuild/restart                  | Signed installer and Tauri updater                                                          | Application restart                                       |

The standalone SDK release is independent from the desktop release. Updating a
Runtime sidecar therefore does not require rebuilding the native shell. The
release workflow publishes the target binary, protocol metadata, byte length,
and SHA-256 as one verified candidate; the desktop supervisor installs it into a
versioned directory and explicitly reloads the process. If the replacement
fails to start, the supervisor restarts the prior binary.

Supported conversation-schema upgrades are performed during desktop startup,
after the shell restart closes the old Runtime and its workspace children.
The candidate's SDK bootstrap reports `restart_required` before opening or
migrating the database. Online activation and the supervisor's replacement
entrypoint reject this status before stopping the active process; install the
desktop update to proceed. Older hosts reject the unknown status as well.
This prevents an unsuccessful online candidate from leaving a database its
automatic old-binary rollback cannot read. Startup understands that status as
launch-ready, preserving the ordinary backed-up, non-destructive migration.
Fallback binaries must pass SDK compatibility inspection before launch and
must never reset a newer database or replace its migration backup.

The schema-11 lazy checkpoint, image-reference and trace-page release uses SDK
protocol 3. The frontend and native Runtime supervisor must agree with that
version. Signed manifests derive the exact Runtime range from the SDK constant;
protocol-2 installations receive this combination through the coupled desktop
update, before its frontend or Runtime can activate. Plugin protocol 1 is a
separate contract and does not change with conversation storage.

When a release contains the frontend, Runtime, and native shell together, the
desktop checks aggregate them into one update notification. Runtime and frontend
preparation starts after the shell check; the shell and its exact distribution
download concurrently. All required downloads finish before activation.
When the shell is selected, the old host verifies staged candidate identities
and durably writes
`resources/updates/shell-handoff.json`. It does not replace the old Runtime or
activate the new frontend. The shell installer runs first; the replacement
process reverifies the recorded Runtime, starts and probes it, then activates
the staged frontend and arms its confirmation deadline. No moving channel is
queried to reconstruct a handoff. An identical handoff may be retried. If the
installer left the running shell older than the pending target, preparation of
a strictly newer, fully verified distribution may atomically supersede that
interrupted plan. Lower targets and plans whose shell has already been reached
but whose frontend is not yet confirmed refuse overwrite. A failed write keeps
the prior continuation intact; successful replacement logs `handoff_superseded`
with the current, previous and candidate shell versions. Frontend-only
activation reloads and confirms the frontend in the current process.
An update that activates only frontend or Runtime resources keeps the same
notification model without restarting the shell. Every product release also
publishes current-version installers and shell updater metadata, even when
`nativeShell` source is unchanged; a selected shell update follows the coupled
shell-first sequence above.

The Cua Driver is an ordinary MCP plugin. OpenAgent installs and updates the
verified package from `https://github.com/BANG404/openagent-cua-driver` beneath
the normal plugin root. Runtime loads its declared `mcp.json` through the common
package loader; the desktop has no CUA-specific update or process adapter.

The shell step begins with a preparation command that re-acquires the barrier —
an in-process frontend confirmation releases it, so the Runtime must be drained
again before it is stopped — and then runs the same bounded child teardown the
ordinary exit path uses. Successful preparation confirms the Runtime, event
relay, and workspace children stopped before reporting `install_prepared`.
A teardown error or timeout rejects the installer and restarts the prepared
host to restore its stopped Runtime. The shared native exit progress stays visible
through preparation and installer handoff. An undrainable Runtime
defers the whole update before anything is torn down. This ordering exists because the shell installer,
not the host, ends the process: on Windows the updater plugin launches NSIS and
terminates the application inside `install()`, so no statement after that call
runs and the component-update records it would have written are recovered by
the next process instead. Preparation is therefore also why a prepared handoff
is completed by the restart request that follows it rather than treated as a
second exit, and why a failure after preparation is answered with that restart
instead of an in-place retry.

The Windows shell install call must pass `restartAfterInstall: true` explicitly.
The updater currently defaults to relaunching after NSIS finishes, but keeping
the option at the call site makes the production handoff independent of plugin
or configuration defaults; without it, a successful installer can leave the
desktop process stopped until the user launches it manually.

Windows installers share `src-tauri/windows/install-hooks.nsh`. Before copying
or removing installed bytes, its install and uninstall hooks probe the selected
installation tree with non-writing, exclusive `OPEN_EXISTING` file handles.
A running host image, its workspace images, and temporarily held resources must
all release those files. Sharing and lock violations retry every 250 ms under
one 30-second deadline per gate, checked during traversal as well as between
retries. A large tree must not postpone the deadline until a full scan finishes;
scan exhaustion stops with a distinct English/Chinese explanation before any
installed bytes change. Other errors stop immediately. Neither failure
path mutates installed files or kills processes. Directory reparse points,
including junctions and directory symbolic links, are refused. Legacy Hugging
Face snapshot file symlinks under `$INSTDIR\.fastembed_cache\` are allowed:
exclusive `FILE_FLAG_OPEN_REPARSE_POINT` handles probe only the link object,
including dangling links, without accessing or waiting for external blob
targets. File reparse points elsewhere and non-symlink reparse tags remain
refused. The cache is runtime-generated and is not an installer payload
destination. The exact ordinary directory `$INSTDIR\dev-targets` is also
preserved without traversal: the Windows development runner uses this location
for Cargo output, neither shell bundle writes it, and the pinned Tauri
uninstaller deletes only enumerated payloads. A root `dev-targets` junction is
still refused before this exemption; a file of that name, a sibling prefix, or
a nested `resources/dev-targets` remains subject to access checks. Do not bundle
payloads under that development-cache destination without removing this
exemption and updating its native acceptance. The executing uninstaller
itself is excluded. The hook replaces the pinned template's name-based forced
termination check, so a different installation or development host stays alive.
An installer page runs the same gate after `.onInit` restores the old
installation path and before maintenance can invoke a legacy uninstaller;
`/UPDATE` already skips that uninstall, and silent installs still pass through
the preinstall hook. Non-silent gates display a localized waiting banner,
including passive updates before installer pages appear, and destroy it on
success or failure. Silent gates do not display the banner. The online updater
and offline overlay inherit the same
Windows bundle configuration. Exceptional installer copy is English/Chinese;
ordinary delayed exits complete without a Retry dialog.

Run `bun run test:blackbox:shell-install` on Windows to compile and execute real
NSIS fixtures using these production hooks. It covers 1/5/15-second image exits,
a temporary nested-resource lock, immediate permission refusal, the 30-second
timeout with old bytes intact, manual maintenance, scoped uninstall, and another
same-name installation staying alive. Cache link fixtures cover locked external
targets, dangling links, link-object locks, install/uninstall, and refusal of
directory junctions without changing external bytes. A 200,000-file development
cache with an active host is preserved during prompt install/uninstall; cache
junctions and nested payload locks retain the normal checks. A short-deadline
large payload fixture proves timeout during traversal with old bytes intact.
Passive fixtures assert a visible waiting window and capture English/Chinese
native screenshots before automatically completing after image release. The runner
uses temporary directories, including Chinese and spaced paths, and Rust-built
image/handle holders; override `MAKENSIS` only to select an installed NSIS compiler.
It then starts a real debug Tauri window with its verified prepared Runtime and
executes `tests/blackbox/shell-install.toml` through `tauri-pilot`, asserting that
preparation returns only after the supervised Runtime stops and the host records
`install_prepared`. Prepare the exact public kit with `bun run dev:prepare`
before this native pass. These checks do not substitute for signed packaged
component-update qualification.

After a frontend activation, the host's first WebView confirmation owns the
completion notice. Other workspace and utility WebViews still confirm the
active resource but must not display another completion notice.

Update notifications present each selected component as its own current-to-
candidate version transition. The About surface presents only the product
release headline; the packaged shell version, the frontend build identity, and
the Runtime release identity stay independent host-reported values that the
product UI does not render, and none of them is a composite product version.

The desktop host writes local component-update lifecycle diagnostics to the
daily `OPENAGENT_HOME/logs/openagent-host.jsonl.<date>` file. These records cover
shell checks/download/install/restart, Runtime preparation and supervised
activation/rollback, and frontend
preparation/navigation/restoration/confirmation/timeout. A continuation names
the candidate it restored and the stage that armed its deadline, so a repeated
update prompt can be traced to the record the interrupted process left. The
Runtime's ordinary `openagent.<date>.jsonl` log separately records the
drain request, active-run count, bounded result, and resume transition. Keep
component versions and fixed error categories in frontend-originated records;
never record conversation identifiers, content, credentials, or raw frontend
errors. Both rolling log families retain at most 15 files; multiple desktop host
processes may append to the same host file for a given day.

## Desktop Runtime boundary

The host's `component_updates/` module owns activation coordination.
`barrier.rs` acquires and releases the single graceful write barrier;
`runtime.rs` keeps candidate validation, replacement, reconnect, and rollback in
one transaction; `frontend.rs` owns resource navigation, confirmation, and its
deadline. `sources.rs` owns channel resource sources and `versions.rs` projects
release identities. Shell preparation stays in `desktop_exit.rs` and acquires
the same barrier before its shared bounded teardown.

Release Runtime bootstrap synchronizes compatible installed plugin subscriptions
before mounting package processes when the Runtime version changes. Plugin
SemVer advances independently; protocol ranges control admission. Failed updates
preserve installed bytes/data and retry on the next startup. Debug Runtime
bootstrap retains explicit plugin updates. Synchronization uses an eight-second
network budget so existing desktop readiness deadlines continue to apply.
The plugin contract owns schema, selection, publication and retry details.
SDK and desktop Runtime publication run the independent
standard-package pipeline; desktop publication requires that pipeline to succeed.

Ordinary debug and release desktop builds use one supervised external
`openagent-server` as the only Runtime process that owns configuration, SQLite,
memory, and other durable state. Public App owns configuration and startup
policy, linked into both server and shell without an execution dependency.
Public development prepares a verified binary; authorized source development
builds the server separately. Product
operations travel through the typed SDK operation map and an authenticated
loopback HTTP/SSE transport. Tauri retains only native
capabilities such as windows, updater, tray, notifications, dialogs, path
opening, and private resource protocols. The installer packages the pinned
server as a verified fallback, but does not run an embedded Runtime alongside
the external process.

The host-side supervisor is implemented as a separate lifecycle component. It
accepts only loopback HTTP readiness records in the supported protocol range,
uses a process-scoped Bearer token for the health probe, stops the current
server through its private stdin control pipe, and starts the candidate only
after the old process exits. If candidate startup or probing fails, it restarts
the previous launch specification. Ordinary release startup activates this
supervisor before writable product operations are accepted, preserving the
single-writer boundary.
Before stopping the current server for a Runtime activation, the host runs the
verified candidate's read-only `--desktop-bootstrap inspect` command against
the selected application-data root. A `transition_required` result aborts the
activation while the current Runtime and its data remain untouched; only a
`ready` result may cross the process replacement boundary.
The supervisor, authenticated Tauri proxy, and host-owned resource protocols are
public desktop adapters so contributors can build and extend the shell without
receiving the private Runtime implementation. Agent execution, providers,
prompts, persistence, and Runtime-owned state machines remain in the private SDK.

The Runtime exposes a Bearer-only component-update barrier that blocks new HTTP
writes before waiting for authoritative run guards to release. Product component
updates never cancel an active Agent execution: when the bounded graceful wait
expires, activation is deferred and the user may retry after the run finishes.
The barrier covers Runtime, frontend, and desktop-shell activation as one update
sequence, and frontend-only or failed updates explicitly release it. The thin
host keeps an installed candidate in Rust-owned pending state, so a WebView
cannot select an arbitrary executable. In external mode the activation
transaction stops the event relay, starts and probes the candidate, validates a
durable desktop bootstrap, reconnects SSE, and only then commits `active.json`.
Candidate startup, bootstrap, reconnect, or selection-commit failure restores
the previous launch specification and emits a generic rollback reason without
exposing the process token or user data. Runtime version comparison uses the
active resource or supervised process version, not the independently versioned
Tauri application.

The Runtime identity the host reports as component detail is a release identity
rather than the supervised process's crate version. It prefers the active
Runtime resource's `release_version`, then that resource's own `version`, and
finally the packaged shell release the bundled sidecar ships inside, and it is
absent while no Runtime runs. The process record cannot serve as that identity:
`openagent-server` reports the crate version of the binary it was built from,
and the packaged sidecar is built from an unstamped SDK checkout, so every
product release would otherwise report the same Runtime version.

The supervised server accepts that process-scoped Bearer token for its typed
product `/api` routes, exposes a Bearer-only complete desktop startup bootstrap,
and projects the transport-neutral Runtime event bus through authenticated
`/api/events` SSE. Bearer requests do not create browser sessions or bypass the
loopback and workspace allowlists; paired browser clients retain their separate
Cookie and CSRF boundary. Tauri keeps the token in Rust, bounds and restricts
proxied WebView requests to `/api`, and re-emits Runtime messages through the
existing desktop event names. A lagged or disconnected stream stops delivery;
the frontend restores a fresh durable startup snapshot before restarting it.
Every supervised desktop launch explicitly enables this product surface with
`--desktop-api`. The resulting server exposes the typed desktop `/api/desktop/*`
surface on the same process; browser Cookie/CSRF sessions continue to use the
separate Remote Gateway surface.
Runtime-generated media and HTML URLs are rewritten to the private
`openagent-runtime` protocol. Rust adds authentication and permits only bounded
GET/HEAD asset routes, including byte ranges for media; the Bearer token never
enters WebView state. Relative HTML assets remain on the same private origin.

This boundary prevents two runtimes from writing the same SQLite state and avoids
an unstable Rust ABI between the shell and SDK.

A frontend-only production update uses a signed, versioned `tar.gz` bundle under
`OPENAGENT_HOME/resources/frontend/<version>/`. The host verifies the detached
Minisign signature before parsing the manifest, checks archive size and SHA-256,
requires separate compatible frontend-shell and frontend-Runtime protocol
ranges, rejects traversal, links,
unexpected entry types, and declared extraction-limit
violations, then commits an immutable version directory. Activation atomically
updates `active.json` and reloads every product WebView through the host-owned
`openagent-ui` protocol. The new frontend confirms its version from the client
startup hook before route components mount. Retry only transient confirmation
failures within the bounded activation window, and do not expose interactive
Runtime writes while the Runtime remains drained. If the frontend does not
confirm within 15 seconds, the host restores the previous verified version or
its embedded frontend, and the embedded frontend always remains the final
fallback.

A process that exits while a confirmation is pending did not disprove the
candidate, and the shell installer replacing that process is the ordinary case,
so the next process continues the activation instead of discarding it: it
serves the pending candidate and arms the same 15-second deadline for it after
the windows that will confirm it exist. A confirmation that arrives clears the
marker and the deadline expires harmlessly; otherwise that process rolls the
candidate back and re-navigates. Startup still verifies the selection before any
WebView exists, so an unverifiable candidate is cleared first and never
continued. Deadlines are scoped to the candidate version they were armed for, so
a late one cannot discard a newer selection or fight another host process over
the same `active.json`.

The outgoing frontend must
not announce success after merely requesting WebView navigation; the confirmed
replacement frontend owns the component-update completion notice.
On Windows, both initial resource loads and runtime navigation use WebView2's
mapped `http://openagent-ui.localhost/` origin; passing the registered custom
scheme directly to an existing WebView bypasses Wry's construction-time rewrite
and cannot complete the activation handshake. Other platforms retain the
registered `openagent-ui://localhost/` URL.

Every frontend bundle carries its own build identity, stamped by
`scripts/frontend-build-identity.mjs` and `vite.config.js` as the
`__OPENAGENT_FRONTEND_BUILD__` global in `<product version>+<abbreviated
revision>` form. An embedded frontend, an installed resource, and a development
bundle therefore each identify the code that is executing instead of the shell
version they shipped with, and a frontend resource install changes that identity
as soon as the new bundle loads. The product UI does not present it: the About
view shows only the product release headline. The revision is resolved once per
Vite run and falls back to the bare product version when the build has no Git
repository, so do not derive a frontend version in the host either:
`get_component_versions` reports only the product release, shell, and Runtime
identities, because the frontend has no version axis of its own — a product
release advances `package.json` in lockstep with the shell.

Treat application SemVer as an update identity, never as a compatibility
contract. Each replaceable component declares protocol ranges for every live
edge it consumes: Runtime manifests cover the shell/Runtime
transport, while frontend manifest schema 2 names both `compatibility.shell`
and `compatibility.runtime`. The shell accepts a candidate only when its own
protocol values fall inside every declared range. A frontend-shell contract
change must select both `frontend` and `nativeShell` for release; changing the
signed frontend manifest generator must select `frontend`. A shared Runtime
protocol change flows through the pinned SDK protocol owner and selects both
`frontend` and `runtime`, with native-shell qualification enforcing that the
public shell constant matches it.

## Development verification

Use an isolated `OPENAGENT_HOME` with `bun tauri dev` to verify that the native
shell starts, the supervised external `openagent-server` reaches its desktop
bootstrap, and the Vite frontend mounts through the real WebView. Verify the
host and Runtime log files separately. A frontend source edit must acquire and
release the Runtime barrier before the full reload. Only source changes under
`src/` or `static/` enter that frontend barrier; generated files and tool logs
elsewhere in the repository must not reload the WebView. An SDK Runtime source edit
must rebuild and stage the sidecar before the pending stamp lets Tauri restart.

Production signed-resource commands remain disabled in debug builds. Exercise
their download, signature, version comparison, activation, confirmation,
continuation, and rollback behavior with the host Rust integration fixtures,
which serve locally signed frontend and Runtime manifests over loopback.
Continuation is covered by activating a signed fixture, dropping the manager,
and asserting that a second manager for the same home serves the same pending
candidate and still refuses one it cannot verify. Because the resource commands
are debug-disabled, the end-to-end path — a shell install ending the process
mid-activation and the next process continuing it — is only reachable in a
packaged build; drive it through an in-app update and assert that
`openagent-host.jsonl.<date>` shows the restored candidate, its confirmation
deadline, and no returning update prompt. Exercise shell aggregation and
independent component-version presentation with frontend tests; do not point a
development build at a production fixed channel merely to test update state.
About presents only the product release, so a development run must show the
active frontend resource's release identity there, or the packaged shell
version while no external resource is active, and no component version line.

## Independent shell provisioning and shell-first continuation

New signed Runtime manifests bind their platform sandbox helpers as well as the
server executable. Runtime installation stages both under one version directory;
every reuse and activation verifies helper bytes. Published legacy manifests that
omit this field remain readable, while newly generated development and product
manifests must include their exact SDK's helpers. Future-release download does
not replace the running process's embedding seed. Bootstrap persistence inspection
uses the verified candidate directly before committing its Runtime selection.

Product distributions use `<sdk version>+desktop.<product version>` as the
Runtime installation identity. The build metadata separates product releases
that reuse one SDK binary but rebuild Windows helpers; it does not change SDK
SemVer precedence. Compare SDK precedence first, then product `release_version`
when SDK precedence is equal, including Beta/RC/Stable transitions. Standalone
SDK manifests retain their independent version. At every staging commit and
rename-race recovery, reuse requires a verified installed signature, the exact
candidate manifest bytes, executable hash and all helper hashes. A matching
executable alone must not discard staged helper or manifest repair. Legacy
same-version distributions are repaired through this complete check. Preserve
the installed directory on rename failure; candidate admission failures happen
before installation commit. The signed Runtime helper-update fixture covers
same-binary helper replacement, helper corruption, manifest/signature repair and
verified reuse. Native shell-resource coverage repeats a cached handoff with
only a corrupted installed helper and proves it returns to the product window.

The packaged application embeds `src/bootstrap/`, built independently with
`bootstrap.vite.config.js`. It renders the shared `OnboardingFlow` welcome step
with native resource progress, retry and offline import. The component receives
its SDK client only from the product page; the embedded welcome has no Runtime
transport and cannot advance before resources are ready. Release startup shows a
neutral loading shell in the main window before checking installed selections
through their resource owners. Startup presentation and resource phase are
independent: downloading or starting does not imply first-use onboarding.
With a verified Runtime and a frontend meeting the signed installation identity, ordinary
startup opens the product directly, without staging or recopying a distribution.
An unfinished shell handoff still consumes its exact signed distribution.
An existing frontend admitted by its resource owner keeps Welcome unmounted
through replacement-resource preparation, Runtime startup and product
navigation, including shell continuation and cached repair. The visible loading
shell provides native window controls throughout that wait. A frontend older
than the required frontend component may require a new distribution without reopening Welcome.
Formal releases can retain original shell and frontend bytes while advancing the
installed product version. The signed packaged distribution binds those component
versions; startup and updater handoffs use its product identity. Without packaged
identity metadata, existing installers retain their compiled-version behavior.
See [component reuse](../../openagent-release-engineering/references/component-reuse.md).
Initial preparation without an admitted frontend, explicit offline import and
actionable startup failures retain the shared welcome/recovery surface.
An existing shell handoff also keeps Welcome hidden when the new shell's
protocol rejects the old frontend selection. After staging the exact signed
distribution, Runtime startup admission may continue with its verified candidate
when the resource owner has cleared an unusable old selection. Rejected protocol
or damaged-resource selections must not require a manual retry; malformed or
unreadable activation state still fails without being overwritten. Keep old
installed bytes and all product data intact. Native shell-resource coverage seeds
both old protocol selections and asserts a first-attempt handoff without Welcome, with
unchanged configuration.
First installation keeps resource preparation inside the existing welcome step;
after installation the same main WebView continues the full wizard through
`onboarding-inline`, and completion returns that window to the ordinary product.
Never replace this with a separate preparation screen or open a second setup
window for this handoff. Temporary appearance choices cross the navigation through
native process state and validated URL inputs; Runtime persists them on Finish.
Missing or invalid resources and startup failures reveal the same surface with
retry and offline import. Keep this decision independent of onboarding completion:
Runtime alone persists configuration and validates the local embedding model.
The product welcome reads `get_onboarding_resource_status` through its page
container and combines frontend and Runtime results with SDK embedding status.
This local host command checks the selected frontend's signed manifest and usable
entry point using its startup owner, and probes the supervised Runtime's health
before checking its selected binary and sandbox helpers through its resource
owner. Runtime selection must match the running binary. Frontend copy says
signature verified: this admission boundary does not rehash extracted frontend
files. Normal Vite development reports a development frontend and a healthy
local Runtime; it does not claim distribution signature verification. Missing
or failed installed selections and failed health/status reads block Continue
and Finish; retry repeats the local checks without checking release channels.
Finish repeats status checks before saving. These checks belong to setup and
must not introduce a new preparation reveal during configured startup.
Before Runtime starts, the embedded welcome lists these three resource groups
as pending beside aggregate distribution progress. Navigation to the product
welcome replaces that pending summary with actual resource-owner results.
The cached distribution's model seed may be passed to Runtime for model repair.
`desktop_bootstrap/provisioning.rs` owns downloading, bounded signed resource
admission, progress, retry and offline-directory import. A versioned,
Minisign-signed `openagent-distribution.json` binds all initial Runtime, frontend,
sandbox-helper and embedding bytes to the exact shell release. Mutable component
channels never supply initial installation or a coupled shell update.

Every resource downloads concurrently into a content-addressed cache. Interrupted
HTTP transfers use validated Range responses; corrupt completed transfers are
removed, verified cached files can be used without their source, and no Runtime
or frontend is activated before the whole distribution is staged. Offline
installers contain that same signed set for their platform; the online installer
contains only the shell and bootstrap. Windows offline installers include the
WebView2 offline installer. System OS libraries and model-provider access remain
platform/use prerequisites rather than application resources.

When Tauri discovers a newer shell, `prepare_release_resources` stages its exact
immutable distribution while the shell installer downloads. The running host
does not execute future Runtime protocols. After the graceful barrier succeeds,
`prepare_shell_handoff` verifies the staged plan and records the target shell
identity. The installer replaces the shell first. The replacement shell reads
and re-verifies the cached distribution, installs Runtime and helpers, provides
the embedding seed to Runtime, starts its inspected application data, then
activates and confirms the frontend. Runtime alone owns backup/transition consent
and embedding-model admission. Failure leaves the bootstrap window usable for
retry or importing an exact-version resource directory.

Run `bun run test:blackbox:shell-resources` to verify the shared welcome/recovery surface
in all locales/themes, normal offline restart without a preparation reveal,
missing-resource repair, and shell-handoff continuation. Its interrupted-installer
scenarios prove that an unverified candidate preserves the old record, a newer
verified plan supersedes it, damaged signatures and helper bytes preserve the old
record, and an identical retry keeps the Runtime running. See
[update verification](update-verification.md) for the failure matrix and commands.
For installed-release recovery before the fixed shell is available, inspect the
host log and running executable version first. If the running shell is still
older than the recorded target and no installer is active, move only
`resources/updates/shell-handoff.json` into a timestamped file under `backups/`,
verify the backup bytes, and retry the newer update. Preserve distribution caches
and active resource selections. Do not remove a reached-but-unconfirmed plan.
The runner uses its own temporary home, advances the same welcome window to Preferences, and records
native window visibility during installed startup.

Frontend-host protocol 2 requires shell provisioning and continuation commands.
New frontend artifacts declare that protocol so older protocol-1 shells reject
them until a shell update completes; legacy frontend manifests remain readable.
