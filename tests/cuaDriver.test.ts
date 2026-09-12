// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  CUA_DRIVER_ARGS,
  CUA_DRIVER_ID,
  createCuaDriverServer,
  ensureCuaDriverServer,
} from "../src/lib/cuaDriver";
import type { AppConfig } from "../src/lib/types";

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

describe("Cua Driver configuration", () => {
  test("uses direct MCP mode so the driver can be used by the generic MCP client", () => {
    expect(createCuaDriverServer().args).toEqual([...CUA_DRIVER_ARGS]);
    expect(createCuaDriverServer().env).toMatchObject({
      CUA_DRIVER_PERMISSION_MODE: "unrestricted",
      CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS: "1",
    });
  });

  test("seeds and upgrades the reserved entry without changing user MCP servers", () => {
    const userServer = {
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
    const seeded = ensureCuaDriverServer(configWithServers([userServer]));
    expect(seeded.mcp.servers.map((server) => server.id)).toEqual([CUA_DRIVER_ID, "user-mcp"]);

    const legacy = {
      ...createCuaDriverServer(),
      args: ["mcp"],
      env: { CUA_DRIVER_PERMISSION_MODE: "bounded" },
    };
    const upgraded = ensureCuaDriverServer(configWithServers([legacy, userServer]));
    expect(upgraded.mcp.servers[0].args).toEqual([...CUA_DRIVER_ARGS]);
    expect(upgraded.mcp.servers[0].env).toEqual({ CUA_DRIVER_PERMISSION_MODE: "bounded" });
    expect(upgraded.mcp.servers[1]).toEqual(userServer);
  });
});
