# Modular frontend and SDK updates

OpenAgent separates development reloads and reusable SDK delivery from desktop
installer updates. The separation is process- and protocol-based; the Rust SDK
is never loaded as a replaceable dynamic library.

## Supported boundaries

| Surface | Development | Published delivery | Activation |
| --- | --- | --- | --- |
| Frontend | Vite HMR through `bun tauri dev` | Signed `frontend-beta`, `frontend-rc`, or `frontend-stable` resource | Confirmed WebView reload with rollback |
| Desktop Runtime / headless SDK | Rebuild and restart `openagent-server` | Signed Runtime channel or versioned SDK release binaries plus `openagent-sdk-manifest.json` | Supervised drain, restart, probe, reconnect, and rollback |
| Third-party client | Local TypeScript source or published npm package | `@bang404/openagent-harness` | Normal package update |
| Desktop native shell | Tauri rebuild/restart | Signed installer and Tauri updater | Application restart |

The standalone SDK release is independent from the desktop release. Updating a
headless integration or development harness therefore does not require building
or installing the OpenAgent desktop application. The public Harness package can
download the target binary, verify its protocol range, byte length, and SHA-256,
install it into a versioned directory, and explicitly reload the supervised
process. If the replacement fails to start, the supervisor restarts the prior
binary.

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

The Runtime now exposes a Bearer-only drain barrier that blocks new HTTP writes,
optionally cancels active conversations, and waits for authoritative run guards
to release. The thin host keeps an installed candidate in Rust-owned pending
state, so a WebView cannot select an arbitrary executable. In external mode the
activation transaction drains the old process, stops the event relay, starts and
probes the candidate, validates a durable desktop bootstrap, reconnects SSE, and
only then commits `active.json`. Candidate startup, bootstrap, reconnect, or
selection-commit failure restores the previous launch specification and emits a
generic rollback reason without exposing the process token or user data. Runtime
version comparison uses the active resource or supervised process version, not
the independently versioned Tauri application.

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
`--desktop-api`; an ordinary standalone Harness launch exposes only `/v1`, so a
Bearer token cannot discover desktop-only `/api` routes.
Runtime-generated media and HTML URLs are rewritten to the private
`openagent-runtime` protocol. Rust adds authentication and permits only bounded
GET/HEAD asset routes, including byte ranges for media; the Bearer token never
enters WebView state. Relative HTML assets remain on the same private origin.

This boundary prevents two runtimes from writing the same SQLite state and avoids
an unstable Rust ABI between the shell and SDK.

A frontend-only production update uses a signed, versioned `tar.gz` bundle under
`OPENAGENT_HOME/resources/frontend/<version>/`. The host verifies the detached
Minisign signature before parsing the manifest, checks archive size and SHA-256,
requires a compatible frontend-host protocol range, rejects traversal, links,
unexpected entry types, and declared extraction-limit
violations, then commits an immutable version directory. Activation atomically
updates `active.json` and reloads every product WebView through the host-owned
`openagent-ui` protocol. The new frontend confirms its version after mounting;
if it does not confirm within 15 seconds, or the process exits while confirmation
is pending, the host restores the previous verified version or its embedded
frontend. The embedded frontend always remains the final fallback.

## Third-party development

Third-party Node and Bun applications use `@bang404/openagent-harness/node`. They
may provide a locally built binary, an explicitly managed binary path, or install
one from an SDK release manifest. The server is loopback-only, uses a
process-scoped Bearer token, and exposes the narrow `/v1` contract rather than
desktop-only capabilities or private runtime records.

Reload is intentionally explicit. The caller finishes or cancels active runs,
installs the verified version, and calls `reload(newBinaryPath)`. Durable state
under the caller-selected `OPENAGENT_HOME` survives; in-memory work does not.
