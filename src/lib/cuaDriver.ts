import type { AppConfig, McpServerConfig } from "./types";

export const CUA_DRIVER_ID = "cua-driver";
export const CUA_DRIVER_COMMAND = "cua-driver";
/**
 * Local endpoint shared by the product-managed `cua-driver serve` daemon and
 * its reserved MCP client. It is product policy rather than a user setting, so
 * both processes are always started with the same value.
 */
export const CUA_DRIVER_SOCKET = "openagent-cua-driver.sock";
/**
 * The reserved entry is a fixed MCP proxy onto the daemon that OpenAgent
 * starts. Permission mode, socket, and grants are product policy; users can
 * only enable or disable the plugin and narrow the exposed tool surface.
 */
export const CUA_DRIVER_MCP_ARGS = [
  "mcp",
  "--grant",
  "existing-profile",
  "--socket",
  CUA_DRIVER_SOCKET,
] as const;

export function createCuaDriverServer(): McpServerConfig & { disabled_tools: string[] } {
  return {
    id: CUA_DRIVER_ID,
    name: "Cua Driver",
    enabled: true,
    transport: "stdio",
    url: "",
    bearer_token: "",
    headers: {},
    command: CUA_DRIVER_COMMAND,
    args: [...CUA_DRIVER_MCP_ARGS],
    env: {},
    cwd: "",
    disabled_tools: [],
  };
}

/** Whether a reserved entry already matches the fixed product launch shape. */
export function isCuaDriverServerCurrent(server: McpServerConfig): boolean {
  return (
    server.command === CUA_DRIVER_COMMAND &&
    server.args.length === CUA_DRIVER_MCP_ARGS.length &&
    server.args.every((arg, index) => arg === CUA_DRIVER_MCP_ARGS[index]) &&
    Object.keys(server.env).length === 0
  );
}

/** Add the product-managed Cua entry without touching user MCP services. */
export function ensureCuaDriverServer(config: AppConfig): AppConfig {
  const existing = config.mcp.servers.find((server) => server.id === CUA_DRIVER_ID);
  if (!existing) {
    return {
      ...config,
      mcp: { ...config.mcp, servers: [createCuaDriverServer(), ...config.mcp.servers] },
    };
  }
  if (isCuaDriverServerCurrent(existing)) return config;
  return {
    ...config,
    mcp: {
      ...config.mcp,
      servers: config.mcp.servers.map((server) =>
        server.id === CUA_DRIVER_ID
          ? {
              ...server,
              command: CUA_DRIVER_COMMAND,
              args: [...CUA_DRIVER_MCP_ARGS],
              env: {},
            }
          : server,
      ),
    },
  };
}
