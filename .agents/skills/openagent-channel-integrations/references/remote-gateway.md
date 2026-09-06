# Remote gateway

OpenAgent's remote gateway lets a paired browser operate the conversation
runtime through the same SDK used by the desktop UI. A remote client can select
an allowed workspace, role, and model; create, browse, rename, pin, delete, and
cancel conversations; submit chat, `/compact`, `/goal`, and `/graph` with
typed quoted excerpts selected from earlier assistant messages; resolve
durable approvals and `ask_user`; upload attachments; switch or fork branches;
re-run edited turns; and roll back file changes.

The desktop and remote pages use the same typed `OpenAgentClient`. The desktop
installs `TauriTransport`; the remote page installs `HttpTransport`, which maps
the shared SDK operations to this authenticated REST and SSE gateway. Pairing
and workspace allowlisting remain HTTP-adapter policy rather than runtime state.

The paired browser follows the desktop configuration's theme, language, message
layout, responsive two-column threshold, and book-mode font size. These are
read-only presentation preferences on the remote surface; change them from the
desktop General settings page.

## Enable and connect

1. Open **Settings → Channels → Gateway**.
2. Enable remote web control and explicitly allow the current workspace.
3. For a trusted local network, enable **Allow direct LAN access** and open the
   LAN URL shown in Settings. For access outside that network, put a trusted HTTPS
   tunnel or reverse proxy in front of `http://127.0.0.1:32123/remote`.
4. Open the selected URL on the remote device and enter the one-time pairing code
   shown in Settings.

Direct LAN access is disabled by default and should only be enabled on trusted
networks. Do not expose port `32123` through router port forwarding. A proxy
must preserve same-origin
requests and should set `X-Forwarded-Proto: https` so the session cookie is
marked `Secure`.

## Security model

- Remote access is disabled by default.
- Direct LAN requests are rejected unless LAN access is explicitly enabled.
- Workspaces are an explicit allowlist. The HTTP API uses opaque workspace IDs
  and never accepts filesystem paths from the browser.
- A pairing code can be tried at most five times per minute and rotates after a
  successful pairing. Sessions are stored in memory and expire after 30 days;
  restarting OpenAgent revokes them.
- Browser sessions use an HttpOnly, SameSite=Strict cookie. Every state-changing
  endpoint also requires a session-specific CSRF token.
- The page is served with no-store, content-type, framing, referrer, and CSP
  response headers. Its Svelte UI reuses the desktop transcript, composer,
  streamed-content, approval, and `ask_user` components; the inline SPA
  bootstrap is authorized by an exact asset script hash rather than a broad
  inline-script exception. No CORS access is enabled.
- Transcript file, media, and HTML operations are explicit SDK capabilities,
  not arbitrary Tauri command forwarding. Every path is canonicalized beneath
  the conversation's allowlisted workspace. Media uses authenticated,
  expiring, opaque URLs with byte-range streaming; HTML preview resources use
  a separate directory grant and traversal-safe relative paths.
- Missing durable attachment blobs can be repaired from the browser. Repair
  bodies are limited to 20 MB and stored only when the SHA-256 digest exactly
  matches the checkpoint locator.
- A role ID is accepted only when it is global or belongs to the selected
  workspace.
- Every workspace runs in its existing isolated OpenAgent process. The gateway
  authenticates loopback IPC with a per-process token instead of switching the
  application's global workspace during a run.

## Approvals and questions

There is no remote-only approval state. Both the desktop and remote page read
pending calls from the same interrupted checkpoint. A remote answer calls
`resume_interrupted_chat`, exactly like the desktop UI; its tool result and new
branch tip are persisted before either UI observes completion. If both devices
act at once, the existing stale interrupt ID and per-conversation resume lock
reject the duplicate action.

## Transport behavior

- The desktop application must remain running.
- The gateway intentionally exposes the product conversation surface and the
  workspace presentation capabilities required by the shared chat components.
  Desktop administration surfaces (provider secrets, updater, tray, Inspector,
  and unrestricted OS integration) remain local-only.
- Long-running chat, Goal, and Graph requests are acknowledged after dispatch
  and observed through scoped SSE state. `/compact` waits for and returns its
  immediate `changed` result, including the no-op case.
- Remote sessions are intentionally process-local; devices pair again after an
  application restart.
