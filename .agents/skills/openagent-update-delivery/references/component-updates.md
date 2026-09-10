# Modular frontend and SDK updates

OpenAgent separates development reloads and reusable SDK delivery from desktop
installer updates. The separation is process- and protocol-based; the Rust SDK
is never loaded as a replaceable dynamic library.

## Supported boundaries

| Surface                        | Development                                      | Published delivery                                                                          | Activation                                                |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Frontend                       | Vite HMR through `bun tauri dev`                 | Signed `frontend-beta`, `frontend-rc`, or `frontend-stable` resource                        | Confirmed WebView reload with rollback                    |
| Desktop Runtime / headless SDK | Rebuild and restart `openagent-server`           | Signed Runtime channel or versioned SDK release binaries plus `openagent-sdk-manifest.json` | Supervised drain, restart, probe, reconnect, and rollback |
| Third-party client             | Local TypeScript source or published npm package | `@bang404/openagent-harness`                                                                | Normal package update                                     |
| Desktop native shell           | Tauri rebuild/restart                            | Signed installer and Tauri updater                                                          | Application restart                                       |

The standalone SDK release is independent from the desktop release. Updating a
headless integration or development harness therefore does not require building
or installing the OpenAgent desktop application. The public Harness package can
download the target binary, verify its protocol range, byte length, and SHA-256,
install it into a versioned directory, and explicitly reload the supervised
process. If the replacement fails to start, the supervisor restarts the prior
binary.

When a release contains the frontend, Runtime, and native shell together, the
desktop checks aggregate them into one update notification. Frontend and Runtime
resources are downloaded and verified before activation; the Tauri updater
downloads the shell package in the background but installs it only after the
user selects the update action. Activation drains and probes the Runtime,
reloads and confirms the frontend, then installs the shell and restarts the
application. Component-only releases keep the same notification model without
restarting the shell.

Update notifications present each selected component as its own current-to-
candidate version transition. The About surface labels the packaged application
version as the desktop-shell version; it is not a composite product version and
does not advance for frontend-only or Runtime-only releases.

The desktop host writes local component-update lifecycle diagnostics to the
daily `OPENAGENT_HOME/logs/openagent-host.jsonl.<date>` file. These records cover
shell checks/download/install/restart, Runtime preparation and supervised
activation/rollback, and frontend preparation/navigation/confirmation/timeout.
The Runtime's ordinary `openagent.<date>.jsonl` log separately records the
drain request, active-run count, bounded result, and resume transition. Keep
component versions and fixed error categories in frontend-originated records;
never record conversation identifiers, content, credentials, or raw frontend
errors. Both rolling log families retain at most 15 files; multiple desktop host
processes may append to the same host file for a given day.

## Desktop Runtime boundary

Ordinary debug and release desktop builds use one supervised external
`openagent-server` as the only Runtime process that owns configuration, SQLite,
memory, and other durable state. Development builds prepare the local debug
server and retain an explicit embedded mode only for Runtime-local diagnosis; a
failed default external launch does not silently fall back to it. Product
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
`--desktop-api`. The resulting server retains the complete Harness `/v1`
surface and adds the desktop `/api` surface on the same process; an ordinary
standalone Harness launch exposes only `/v1`, so a Bearer token cannot discover
desktop-only `/api` routes.
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
confirm within 15 seconds, or the process exits while confirmation is pending,
the host restores the previous verified version or its embedded frontend. The
embedded frontend always remains the final fallback. The outgoing frontend must
not announce success after merely requesting WebView navigation; the confirmed
replacement frontend owns the component-update completion notice.

Treat application SemVer as an update identity, never as a compatibility
contract. Each replaceable component declares protocol ranges for every live
edge it consumes: Runtime manifests cover the shell/Runtime and Harness/Runtime
transport, while frontend manifest schema 2 names both `compatibility.shell`
and `compatibility.runtime`. The shell accepts a candidate only when its own
protocol values fall inside every declared range. A frontend-shell contract
change must select both `frontend` and `nativeShell` for release; changing the
signed frontend manifest generator must select `frontend`. A shared Runtime
protocol change flows through the pinned SDK protocol owner and selects both
`frontend` and `runtime`, with native-shell qualification enforcing that the
public shell constant matches it.

## Third-party development

Third-party Node and Bun applications use `@bang404/openagent-harness/node`. They
may provide a locally built binary, an explicitly managed binary path, or install
one from an SDK release manifest. The server is loopback-only, uses a
process-scoped Bearer token, and exposes the narrow `/v1` contract rather than
desktop-only capabilities or private runtime records.

Reload is intentionally explicit. The caller finishes or cancels active runs,
installs the verified version, and calls `reload(newBinaryPath)`. Durable state
under the caller-selected `OPENAGENT_HOME` survives; in-memory work does not.

## Development verification

Use an isolated `OPENAGENT_HOME` with `bun tauri dev` to verify that the native
shell starts, the supervised external `openagent-server` reaches its desktop
bootstrap, and the Vite frontend mounts through the real WebView. Verify the
host and Runtime log files separately. A frontend source edit must acquire and
release the Runtime barrier before the full reload; an SDK Runtime source edit
must rebuild and stage the sidecar before the pending stamp lets Tauri restart.

Production signed-resource commands remain disabled in debug builds. Exercise
their download, signature, version comparison, activation, confirmation, and
rollback behavior with the host Rust integration fixtures, which serve locally
signed frontend and Runtime manifests over loopback. Exercise shell aggregation
and independent component-version presentation with frontend tests; do not
point a development build at a production fixed channel merely to test update
state.
