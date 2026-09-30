# OpenAI Compatibility

The loader accepts the OpenAI `com.openai` extension used by portable and
legacy plugin manifests. `apps` is an optional relative path to `.app.json`;
when omitted, the package root `.app.json` is read. Its `apps` object is
normalized into connector name, connector ID, and optional category metadata.
Connector IDs are deduplicated, empty IDs are ignored, and the file must stay
inside the package root. This metadata does not configure an MCP endpoint or
grant capabilities; `mcp.json` remains the transport source of truth.

HTTP MCP servers support OAuth 2.1 discovery, PKCE S256, loopback callbacks,
public dynamic client registration, refresh tokens, and per-server token
storage. Discovery follows the connector's `WWW-Authenticate` challenge: a 401
on the unauthenticated handshake supplies `resource_metadata` and `scope`, and
that metadata URL takes precedence over the derived locations. The derived
locations are the standardized RFC 9728 placement first — the well-known
segment is inserted between the authority and the path, so
`https://host/v2/mcp` is described at
`https://host/.well-known/oauth-protected-resource/v2/mcp` — and the appended
placement second, which some deployments still serve. Authorization-server
metadata is resolved from the discovered issuer the same way. The
protected resource's advertised `resource` is the canonical RFC 8707 audience;
it is rejected rather than overridden when a connector is explicitly configured
for a different one, and a configured value only fills in when metadata omits
it. The authorization server must advertise PKCE `S256`, expose secure
authorization and token endpoints, and report an `issuer` matching the
discovered issuer. When it advertises RFC 9207 `iss` support, the loopback
callback rejects any authorization response whose `iss` is missing or not
byte-identical to the metadata issuer. Client ID Metadata Documents (CIMD) are
not implemented: an authorization server that offers only CIMD produces an
actionable diagnostic instead of a silent fallback. Hosts start authorization
from the MCP settings surface and refresh MCP connections after the callback
completes; bearer tokens are injected only into the configured server
transport. A connection test also reports whether OAuth is usable for the
endpoint: `not_applicable` for a non-HTTP transport, `not_required` when the
unauthenticated handshake succeeded, `required` when the endpoint publishes
metadata a flow can use, `unsupported` when it demands credentials without
serving usable metadata, and `unknown` when the attempt settled nothing. The
settings surface offers the authorization action for `required` and `unknown`
only, replaces it in place with an explanation otherwise, and prechecks the
capability before acting on a connector that was not tested yet, so no entry
point starts a browser flow for an endpoint that cannot finish one.

MCP Apps resources use `ui://` URIs and `text/html;profile=mcp-app`, are
isolated in sandboxed iframes, and receive the MCP Apps initialize handshake,
host context, tool calls, prompt/resource discovery and reads, link opening,
follow-up messages, modal, file selection/upload/download, inline/fullscreen/PiP
display modes, widget state, and the `window.openai` bridge. Tool results keep
their `content`, `structuredContent`, `_meta`, and `isError` envelope fields.
Widget state and model-context updates are persisted in the conversation
database; model context is consumed by the next provider request. A tool absent
from `_meta.ui.visibility` defaults to model- and app-visible, `["app"]` hides it
from the model catalog, and `["model"]` makes it unreachable from the widget.
`tests/fixtures/mcp-app-demo/` is the committed, dependency-free MCP stdio
server that drives the bridge end to end; see the desktop host skill's
`native-verification.md` for the `test:blackbox:mcp-apps` run.

This is product compatibility, not a claim that every OpenAI-hosted service is
available locally. Checkout is represented by a host confirmation boundary and
does not process payments. OAuth still depends on the provider's discovery and
registration policy.

Repository and personal Marketplace catalogs are discovered from the standard
paths. Every source kind can be installed: `local` paths are read in place,
`url` sources download an archive (`.zip`, `.tar.gz`, `.tgz`) or clone a
repository, `git-subdir` clones and then contains the declared subdirectory
inside the checkout, and `npm` runs `npm pack` (or `npm publish`-equivalent
metadata) with lifecycle scripts disabled and extracts the returned tarball.
Remote sources are staged in a temporary directory and then pass through the
same manifest validation and atomic activation as a direct install, so a
package that fails validation never reaches `OPENAGENT_HOME/plugins`. Source
URLs must be HTTPS without credentials or a query; npm registries must be HTTPS
without credentials, query, or fragment. Downloads and clones are size- and
time-bounded. Git and npm therefore require the corresponding CLI on `PATH`, and
the host must enforce its own CSP, permission, and trust policy before
installing a third-party package.
