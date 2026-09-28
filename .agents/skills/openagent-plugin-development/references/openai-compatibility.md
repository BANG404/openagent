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
host context, tool calls, resource reads, link opening, follow-up messages,
modal, file selection, inline/fullscreen/PiP display modes, and the partial
`window.openai` bridge. File upload/download URLs, checkout, and persistent
model-context updates require a separate durable product contract and must not
be advertised as supported until that contract exists.
