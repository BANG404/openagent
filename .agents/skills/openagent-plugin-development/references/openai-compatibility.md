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
storage. Hosts should start authorization from the MCP settings surface and
refresh MCP connections after the callback completes. Bearer tokens are
injected only into the configured server transport.

MCP Apps resources use `ui://` URIs and `text/html;profile=mcp-app`, are
isolated in sandboxed iframes, and receive the MCP Apps initialize handshake,
host context, tool calls, prompt/resource discovery and reads, link opening,
follow-up messages, modal, file selection/upload/download, inline/fullscreen/PiP
display modes, widget state, and the `window.openai` bridge. Tool results keep
their `content`, `structuredContent`, `_meta`, and `isError` envelope fields.
Widget state and model-context updates are persisted in the conversation
database; model context is consumed by the next provider request.

This is product compatibility, not a claim that every OpenAI-hosted service is
available locally. Checkout is represented by a host confirmation boundary and
does not process payments. OAuth still depends on the provider's discovery and
registration policy. Repository and personal Marketplace catalogs are
discovered from the standard paths and local sources can be installed; remote
URL, Git, and npm sources are listed with their policy metadata but require a
source-specific verified installer before activation. Hosts must also enforce
their own CSP, permission, and trust policy when installing third-party
packages.
