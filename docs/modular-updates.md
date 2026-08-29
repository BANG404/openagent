# Modular frontend and SDK updates

OpenAgent separates development reloads and reusable SDK delivery from desktop
installer updates. The separation is process- and protocol-based; the Rust SDK
is never loaded as a replaceable dynamic library.

## Supported boundaries

| Surface | Development | Published delivery | Activation |
| --- | --- | --- | --- |
| Frontend | Vite HMR through `bun tauri dev` | Signed `frontend-beta`, `frontend-rc`, or `frontend-stable` resource | Confirmed WebView reload with rollback |
| Headless SDK | Rebuild and restart `openagent-server` | Versioned SDK release binaries plus `openagent-sdk-manifest.json` | Supervised process restart |
| Third-party client | Local TypeScript source or published npm package | `@bang404/openagent-harness` | Normal package update |
| Desktop native shell | Tauri rebuild/restart | Signed installer and Tauri updater | Application restart |

The standalone SDK release is independent from the desktop release. Updating a
headless integration or development harness therefore does not require building
or installing the OpenAgent desktop application. The public Harness package can
download the target binary, verify its protocol range, byte length, and SHA-256,
install it into a versioned directory, and explicitly reload the supervised
process. If the replacement fails to start, the supervisor restarts the prior
binary.

## Desktop runtime extraction boundary

The desktop currently embeds `openagent-app` and `openagent-runtime`; a change to
that embedded runtime still requires a desktop updater artifact. Do not present
the headless SDK release as a desktop hot update until the following migration
is complete:

1. Promote every product operation needed by the desktop frontend to the typed
   SDK operation map and authenticated local HTTP/SSE transport.
2. Keep windows, updater, tray, notifications, file pickers, and other native
   capabilities in the Tauri local-capability bridge.
3. Make the thin host supervise a verified `openagent-server` resource beneath
   `OPENAGENT_HOME`, with an installed fallback version and protocol negotiation
   before switching.
4. Drain or explicitly cancel active runs, stop the old process, start and probe
   the new process, reconnect event streams, and restore durable conversations.
5. Publish the SDK manifest through a channel whose authenticity the desktop can
   verify. SHA-256 protects integrity after selection; it does not replace a
   signed update channel.

The host-side supervisor is implemented as a separate lifecycle component. It
accepts only loopback HTTP readiness records in the supported protocol range,
uses a process-scoped Bearer token for the health probe, stops the current
server through its private stdin control pipe, and starts the candidate only
after the old process exits. If candidate startup or probing fails, it restarts
the previous launch specification. The supervisor remains dormant while Tauri
still owns the embedded runtime; activation before transport extraction would
violate the single-writer boundary.

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
