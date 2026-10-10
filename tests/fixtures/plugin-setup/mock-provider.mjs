import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

/** Deterministic loopback-only provider; all credentials are disposable fixtures. */
export async function startMockProvider() {
  let base = "";
  let mode = "success";
  let refreshes = 0;
  let calls = 0;
  /** @type {Map<string, URL>} */
  const codes = new Map();
  /** @type {Set<string>} */
  const tokens = new Set();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", base);
    /** @param {unknown} body @param {number} [status] */
    const json = (body, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    try {
      if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/metadata")
        return json({
          resource: base + "/mcp",
          authorization_servers: [base],
          scopes_supported: ["fixture.read"],
        });
      if (url.pathname === "/.well-known/oauth-authorization-server")
        return json({
          issuer: base,
          authorization_endpoint: base + "/authorize",
          token_endpoint: base + "/token",
          registration_endpoint: base + "/register",
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          authorization_response_iss_parameter_supported: true,
        });
      if (url.pathname === "/register") return json({ client_id: "fixture-public-client" });
      if (url.pathname === "/authorize") {
        if (mode === "pending") {
          response.writeHead(200);
          response.end("Fixture authorization is waiting; cancel in plugin settings.");
          return;
        }
        const callback = new URL(url.searchParams.get("redirect_uri") ?? "");
        if (callback.hostname !== "127.0.0.1" || callback.pathname !== "/oauth/callback")
          return json({}, 400);
        callback.searchParams.set("state", url.searchParams.get("state") ?? "");
        callback.searchParams.set("iss", base);
        if (mode === "denied") callback.searchParams.set("error", "access_denied");
        else {
          const code = randomUUID();
          codes.set(code, url);
          callback.searchParams.set("code", code);
        }
        response.writeHead(302, { location: callback.toString() });
        response.end();
        return;
      }
      let raw = "";
      for await (const chunk of request) raw += chunk;
      if (url.pathname === "/token") {
        const form = new URLSearchParams(raw);
        if (form.get("resource") !== base + "/mcp") return json({ error: "invalid_target" }, 400);
        if (form.get("grant_type") === "authorization_code") {
          const authorization = codes.get(form.get("code") ?? "");
          const challenge = createHash("sha256")
            .update(form.get("code_verifier") ?? "")
            .digest("base64url");
          if (
            !authorization ||
            authorization.searchParams.get("code_challenge") !== challenge ||
            authorization.searchParams.get("code_challenge_method") !== "S256" ||
            authorization.searchParams.get("redirect_uri") !== form.get("redirect_uri")
          )
            return json({ error: "invalid_grant" }, 400);
          codes.delete(form.get("code") ?? "");
        } else if (
          form.get("grant_type") === "refresh_token" &&
          form.get("refresh_token") === "fixture-refresh"
        )
          refreshes++;
        else return json({ error: "invalid_grant" }, 400);
        const token = randomUUID();
        tokens.add(token);
        return json({
          access_token: token,
          token_type: "Bearer",
          refresh_token: "fixture-refresh",
          expires_in: refreshes ? 3600 : 65,
        });
      }
      if (url.pathname !== "/mcp") return json({}, 404);
      if (!tokens.has((request.headers.authorization ?? "").replace(/^Bearer /, ""))) {
        response.writeHead(401, {
          "www-authenticate": `Bearer resource_metadata="${base}/metadata", scope="fixture.read"`,
        });
        response.end();
        return;
      }
      if (request.method !== "POST") {
        response.writeHead(405);
        response.end();
        return;
      }
      const message = JSON.parse(raw);
      if (message.id === undefined) {
        response.writeHead(202);
        response.end();
        return;
      }
      let result;
      if (message.method === "initialize")
        result = {
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "plugin-setup-fixture", version: "1.0.0" },
        };
      else if (message.method === "tools/list")
        result = {
          tools: [
            {
              name: "authenticated_echo",
              _meta: { ui: { visibility: ["app", "model"] } },
              description: "Proves authenticated primary-tool access",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        };
      else if (message.method === "resources/list") result = { resources: [] };
      else if (message.method === "tools/call") {
        calls++;
        result = {
          content: [{ type: "text", text: "authenticated fixture operation" }],
          isError: false,
        };
      } else
        return json({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: "Method not found" },
        });
      json({ jsonrpc: "2.0", id: message.id, result });
    } catch {
      json({ error: "fixture request rejected" }, 400);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture listener unavailable");
  base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    /** @param {string} value */ setMode(value) {
      mode = value;
    },
    get refreshes() {
      return refreshes;
    },
    get calls() {
      return calls;
    },
    close() {
      server.closeAllConnections();
      server.close();
    },
  };
}
