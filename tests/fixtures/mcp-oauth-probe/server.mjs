// Deterministic MCP endpoint used by the MCP OAuth black-box scenario.
//
// The settings surface used to offer authorization for every HTTP connector,
// which turned into a dead end on endpoints that cannot complete an OAuth flow.
// This fixture answers the two shapes that decide whether the action is
// offered, so the scenario can assert the rendered result instead of the
// conclusion:
//
//   POST /unsupported  401 with a Bearer challenge whose metadata is not served
//   POST /required     401 with a Bearer challenge whose metadata is served
//
// Both endpoints demand credentials, so the connection test fails on both and
// only the published metadata separates them. A credential-free endpoint is not
// modelled here: an anonymous handshake that succeeds is what proves that
// capability, and it needs a real MCP exchange. The runtime's own
// `McpOAuthCapability::NotRequired` test covers that shape instead.
//
// Only `/required` publishes metadata, and only at the standardized location
// that inserts the well-known segment before the path. RFC 9728 requires that
// placement, so discovery has to reach it without an appended fallback.
//
// The fixture is dependency-free and binds an ephemeral loopback port, printing
// the base URL as its first line of stdout so the runner never has to guess it.
import { createServer } from "node:http";

const metadata = {
  resource: "http://127.0.0.1/mcp",
  authorization_servers: ["http://127.0.0.1/auth"],
  scopes_supported: [],
};

/** Answer a JSON-RPC request without reading the body. */
function respond(response, status, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end("{}");
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

  if (path === "/.well-known/oauth-protected-resource/required") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(metadata));
    return;
  }

  switch (path) {
    case "/unsupported":
    case "/required":
      respond(response, 401, { "www-authenticate": "Bearer" });
      return;
    default:
      respond(response, 404);
  }
});

server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`http://127.0.0.1:${server.address().port}\n`);
});
