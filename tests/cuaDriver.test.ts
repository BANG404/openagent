// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  CUA_DRIVER_COMMAND,
  CUA_DRIVER_ID,
  createCuaDriverServer,
  cuaDriverMcpArgs,
  ensureCuaDriverServer,
  isCuaDriverEnabled,
  isCuaDriverServerCurrent,
} from "../src/lib/cuaDriver";
import type { AppConfig } from "../src/lib/types";

/** Stand-in for the endpoint the desktop host reports at startup. */
const ENDPOINT = "/home/tester/.cache/openagent/cua-driver.sock";

function configWithServers(servers: AppConfig["mcp"]["servers"]): AppConfig {
  return {
    config_version: 1,
    agent_turn_limit_enabled: false,
    agent_max_turns: 10,
    context_compaction_enabled: true,
    context_compaction_threshold: 200_000,
    context_compaction_prompt: "",
    context_compaction_recent_message_count: 5,
    memory_retrieval_enabled: false,
    providers: [],
    defaults: {
      chat_model: { provider_id: "", model: "" },
      flash_model: { provider_id: "", model: "" },
    },
    model_retry: { retry_count: 3, retry_delay_ms: 30_000, chat_queue: [], flash_queue: [] },
    flash_agents: {
      title: { enabled: true, prompt: "" },
      memory: { enabled: true, prompt: "" },
      skill_category: { enabled: true, prompt: "" },
      suggestions: { enabled: true, prompt: "" },
      hook: { enabled: true, prompt: "" },
      tool_approval: { enabled: false, prompt: "" },
    },
    approval_mode: "off",
    mcp: { servers },
    theme: "system",
    language: "en",
    html_preview: { fixed_height: 480 },
    launch_on_startup: false,
    diagnostic_log_collection_enabled: true,
    quick_chat_shortcut: "Ctrl+Shift+Space",
    mention_palette_show_global_drafts: true,
    message_layout: "single",
    message_double_column_min_width: 1200,
    book_mode_font_size: 17,
    workspace_open_mode: "ask",
    remote_gateway: { enabled: false, allow_lan_access: false, allowed_workspaces: [] },
  };
}

function userMcpServer(): AppConfig["mcp"]["servers"][number] {
  return {
    id: "user-mcp",
    name: "User MCP",
    enabled: true,
    transport: "http" as const,
    url: "https://mcp.example.test",
    bearer_token: "",
    headers: {},
    command: "",
    args: [],
    env: {},
    disabled_tools: [],
  };
}

describe("Cua Driver configuration", () => {
  test("attaches the reserved entry to the host endpoint without authorization flags", () => {
    const server = createCuaDriverServer(ENDPOINT);
    expect(server.command).toBe(CUA_DRIVER_COMMAND);
    expect(server.args).toEqual(["mcp", "--socket", ENDPOINT]);
    expect(cuaDriverMcpArgs(ENDPOINT)).not.toContain("--grant");
    expect(server.env).toEqual({});
    expect(server.disabled_tools).toEqual([]);
  });

  test("recognizes only the current fixed launch shape", () => {
    expect(isCuaDriverServerCurrent(createCuaDriverServer(ENDPOINT), ENDPOINT)).toBe(true);
    expect(
      isCuaDriverServerCurrent(
        {
          ...createCuaDriverServer(ENDPOINT),
          env: { CUA_DRIVER_PERMISSION_MODE: "standard" },
        },
        ENDPOINT,
      ),
    ).toBe(false);
    expect(
      isCuaDriverServerCurrent(
        {
          ...createCuaDriverServer(ENDPOINT),
          args: ["mcp", "--grant", "existing-profile", "--socket", ENDPOINT],
        },
        ENDPOINT,
      ),
    ).toBe(false);
    expect(isCuaDriverServerCurrent(createCuaDriverServer(ENDPOINT), "/tmp/other.sock")).toBe(
      false,
    );
  });

  test("leaves the reserved entry untouched until the host reports its endpoint", () => {
    const config = configWithServers([createCuaDriverServer(ENDPOINT)]);
    expect(ensureCuaDriverServer(config, "")).toBe(config);
    expect(isCuaDriverServerCurrent(createCuaDriverServer(""), "")).toBe(true);
  });

  test("seeds the reserved entry without changing user MCP servers", () => {
    const userServer = userMcpServer();
    const seeded = ensureCuaDriverServer(configWithServers([userServer]), ENDPOINT);
    expect(seeded.mcp.servers.map((server) => server.id)).toEqual([CUA_DRIVER_ID, "user-mcp"]);
    expect(seeded.mcp.servers[0]).toEqual(createCuaDriverServer(ENDPOINT));
    expect(isCuaDriverEnabled(seeded)).toBe(true);

    const current = configWithServers([createCuaDriverServer(ENDPOINT), userServer]);
    expect(ensureCuaDriverServer(current, ENDPOINT)).toBe(current);
    expect(
      isCuaDriverEnabled({
        ...current,
        mcp: { ...current.mcp, servers: [{ ...current.mcp.servers[0], enabled: false }] },
      }),
    ).toBe(false);
  });

  test("drops legacy permission, socket, manifest, and grant overrides", () => {
    const userServer = userMcpServer();
    const legacy = {
      ...createCuaDriverServer(ENDPOINT),
      enabled: false,
      args: ["mcp", "--grant", "existing-profile", "--socket", "openagent-cua-driver.sock"],
      env: {
        CUA_DRIVER_TRANSPORT_MODE: "serve",
        CUA_DRIVER_PERMISSION_MODE: "bounded",
        CUA_DRIVER_SERVE_SOCKET: "/tmp/legacy.sock",
        CUA_DRIVER_MANIFEST_APPS: "com.example.App",
      },
      disabled_tools: ["kill_app"],
    };
    const upgraded = ensureCuaDriverServer(configWithServers([legacy, userServer]), ENDPOINT);
    expect(upgraded.mcp.servers[0]).toMatchObject({
      id: CUA_DRIVER_ID,
      enabled: false,
      command: CUA_DRIVER_COMMAND,
      args: ["mcp", "--socket", ENDPOINT],
      env: {},
      disabled_tools: ["kill_app"],
    });
    expect(upgraded.mcp.servers[1]).toEqual(userServer);
  });
});
