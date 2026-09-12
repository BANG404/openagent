import type { AppConfig, McpServerConfig } from "./types";

export const CUA_DRIVER_ID = "cua-driver";
export const CUA_DRIVER_COMMAND = "cua-driver";

/**
 * The fixed MCP client arguments for the reserved entry.
 *
 * The client attaches to the daemon the desktop host starts on its own private
 * endpoint, which the host reports through `cua_driver_endpoint`. `--grant`
 * cannot appear here: it configures a runtime that the driver launches itself,
 * it is valid only in standard permission mode, and the driver rejects it
 * outright when a daemon is already listening on the endpoint.
 */
export function cuaDriverMcpArgs(endpoint: string): string[] {
  return ["mcp", "--socket", endpoint];
}

/**
 * The reserved entry is a fixed MCP proxy onto the product-managed daemon.
 * Permission mode, endpoint, grants, and manifests are product policy, so the
 * persisted entry only carries the host-provided endpoint. Users can enable or
 * disable the plugin and narrow the exposed tool surface.
 */
export function createCuaDriverServer(
  endpoint: string,
): McpServerConfig & { disabled_tools: string[] } {
  return {
    id: CUA_DRIVER_ID,
    name: "Cua Driver",
    enabled: true,
    transport: "stdio",
    url: "",
    bearer_token: "",
    headers: {},
    command: CUA_DRIVER_COMMAND,
    args: cuaDriverMcpArgs(endpoint),
    env: {},
    cwd: "",
    disabled_tools: [],
  };
}

/**
 * Whether a reserved entry already matches the fixed product launch shape.
 *
 * An unresolved endpoint means the desktop host has not reported its endpoint
 * yet, so the entry cannot be judged and must be left untouched.
 */
export function isCuaDriverServerCurrent(server: McpServerConfig, endpoint: string): boolean {
  if (!endpoint) return true;
  const args = cuaDriverMcpArgs(endpoint);
  return (
    server.command === CUA_DRIVER_COMMAND &&
    server.args.length === args.length &&
    server.args.every((arg, index) => arg === args[index]) &&
    Object.keys(server.env).length === 0
  );
}

/** Whether the reserved entry is present and enabled. */
export function isCuaDriverEnabled(config: AppConfig): boolean {
  return config.mcp.servers.some((server) => server.id === CUA_DRIVER_ID && server.enabled);
}

/** Add or normalize the product-managed Cua entry without touching user MCP services. */
export function ensureCuaDriverServer(config: AppConfig, endpoint: string): AppConfig {
  if (!endpoint) return config;
  const existing = config.mcp.servers.find((server) => server.id === CUA_DRIVER_ID);
  if (!existing) {
    return {
      ...config,
      mcp: { ...config.mcp, servers: [createCuaDriverServer(endpoint), ...config.mcp.servers] },
    };
  }
  if (isCuaDriverServerCurrent(existing, endpoint)) return config;
  return {
    ...config,
    mcp: {
      ...config.mcp,
      servers: config.mcp.servers.map((server) =>
        server.id === CUA_DRIVER_ID
          ? {
              ...server,
              command: CUA_DRIVER_COMMAND,
              args: cuaDriverMcpArgs(endpoint),
              env: {},
            }
          : server,
      ),
    },
  };
}
