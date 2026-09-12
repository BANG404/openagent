import type { AppConfig, McpServerConfig } from "./types";

export const CUA_DRIVER_ID = "cua-driver";
export const CUA_DRIVER_ARGS = ["mcp", "--direct"] as const;
export const CUA_DRIVER_SERVE_SOCKET_ENV = "CUA_DRIVER_SERVE_SOCKET";

export type CuaPermissionMode = "standard" | "bounded" | "unrestricted";
export type CuaTransportMode = "direct" | "serve";

export function cuaTransportArgs(server: Pick<McpServerConfig, "env">): string[] {
  if (server.env.CUA_DRIVER_TRANSPORT_MODE !== "serve") return [...CUA_DRIVER_ARGS];
  const socket = server.env[CUA_DRIVER_SERVE_SOCKET_ENV]?.trim();
  return socket ? ["mcp", "--socket", socket] : ["mcp"];
}

export function createCuaDriverServer(): McpServerConfig & { disabled_tools: string[] } {
  return {
    id: CUA_DRIVER_ID,
    name: "Cua Driver",
    enabled: true,
    transport: "stdio",
    url: "",
    bearer_token: "",
    headers: {},
    command: "cua-driver",
    args: [...CUA_DRIVER_ARGS],
    env: {
      CUA_DRIVER_PERMISSION_MODE: "unrestricted",
      CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS: "1",
      CUA_DRIVER_TRANSPORT_MODE: "direct",
    },
    cwd: "",
    disabled_tools: [],
  };
}

/** Add the product-managed Cua entry without touching user MCP services. */
export function ensureCuaDriverServer(config: AppConfig): AppConfig {
  const existing = config.mcp.servers.find((server) => server.id === CUA_DRIVER_ID);
  if (existing) {
    const mode: CuaPermissionMode =
      existing.env.CUA_DRIVER_PERMISSION_MODE === "standard" ||
      existing.env.CUA_DRIVER_PERMISSION_MODE === "bounded"
        ? existing.env.CUA_DRIVER_PERMISSION_MODE
        : "unrestricted";
    const env: Record<string, string> = {
      ...existing.env,
      CUA_DRIVER_PERMISSION_MODE: mode,
    };
    if (mode === "unrestricted") env.CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS = "1";
    else delete env.CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS;
    const args = cuaTransportArgs({ env });
    if (
      JSON.stringify(existing.args) === JSON.stringify(args) &&
      JSON.stringify(existing.env) === JSON.stringify(env)
    ) {
      return config;
    }
    return {
      ...config,
      mcp: {
        ...config.mcp,
        servers: config.mcp.servers.map((server) =>
          server.id === CUA_DRIVER_ID ? { ...server, args, env } : server,
        ),
      },
    };
  }
  return {
    ...config,
    mcp: {
      ...config.mcp,
      servers: [createCuaDriverServer(), ...config.mcp.servers],
    },
  };
}
