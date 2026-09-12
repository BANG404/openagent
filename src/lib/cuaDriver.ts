import type { AppConfig, McpServerConfig } from "./types";

export const CUA_DRIVER_ID = "cua-driver";
export const CUA_DRIVER_ARGS = ["mcp", "--socket", "openagent-cua-driver.sock"] as const;
export const CUA_DRIVER_SERVE_SOCKET_ENV = "CUA_DRIVER_SERVE_SOCKET";

export type CuaPermissionMode = "standard" | "bounded" | "unrestricted";
export function cuaTransportArgs(server: Pick<McpServerConfig, "env">): string[] {
  const socket = server.env[CUA_DRIVER_SERVE_SOCKET_ENV]?.trim() || "openagent-cua-driver.sock";
  return ["mcp", "--socket", socket];
}

export function createCuaDriverServer(): McpServerConfig & { disabled_tools: string[] } {
  const env = {
    CUA_DRIVER_PERMISSION_MODE: "unrestricted",
    CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS: "1",
    CUA_DRIVER_SERVE_SOCKET: "openagent-cua-driver.sock",
  };
  return {
    id: CUA_DRIVER_ID,
    name: "Cua Driver",
    enabled: true,
    transport: "stdio",
    url: "",
    bearer_token: "",
    headers: {},
    command: "cua-driver",
    args: cuaTransportArgs({ env }),
    env,
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
      CUA_DRIVER_SERVE_SOCKET:
        existing.env[CUA_DRIVER_SERVE_SOCKET_ENV]?.trim() || "openagent-cua-driver.sock",
    };
    delete env.CUA_DRIVER_TRANSPORT_MODE;
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
