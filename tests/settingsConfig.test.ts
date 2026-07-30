// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  createProviderConfig,
  mcpConnectionFingerprint,
  repairModelBindings,
  replaceProviderModels,
} from "../src/lib/settingsConfig";
import type { AppConfig, McpServerConfig, ProviderConfig } from "../src/lib/types";

function provider(
  id: string,
  enabled: boolean,
  models: string[],
  thresholds: Record<string, number> = {},
): ProviderConfig {
  return {
    id,
    name: id,
    provider: "openai",
    api_key: "",
    base_url: "",
    enabled,
    models,
    model_context_compaction_thresholds: thresholds,
  };
}

function config(providers: ProviderConfig[]): AppConfig {
  return {
    providers,
    defaults: {
      chat_model: { provider_id: "missing", model: "missing" },
      flash_model: { provider_id: "disabled", model: "stale" },
    },
    model_retry: {
      retry_count: 2,
      retry_delay_ms: 100,
      chat_queue: [
        { provider_id: "enabled", model: "chat" },
        { provider_id: "disabled", model: "stale" },
      ],
      flash_queue: [{ provider_id: "enabled", model: "unknown" }],
    },
  } as AppConfig;
}

describe("settings config helpers", () => {
  test("creates deterministic provider defaults when an id is supplied", () => {
    expect(createProviderConfig("anthropic", "provider-id")).toMatchObject({
      id: "provider-id",
      name: "Anthropic Node",
      provider: "anthropic",
      enabled: false,
      models: [],
    });
  });

  test("repairs defaults and prunes retry bindings against enabled models", () => {
    const draft = config([
      provider("disabled", false, ["stale"]),
      provider("enabled", true, ["chat", "flash"]),
    ]);

    repairModelBindings(draft);

    expect(draft.defaults.chat_model).toEqual({ provider_id: "enabled", model: "chat" });
    expect(draft.defaults.flash_model).toEqual({ provider_id: "enabled", model: "chat" });
    expect(draft.model_retry.chat_queue).toEqual([{ provider_id: "enabled", model: "chat" }]);
    expect(draft.model_retry.flash_queue).toEqual([]);
  });

  test("prunes thresholds when provider models are replaced", () => {
    const item = provider("enabled", true, ["old", "keep"], { old: 1000, keep: 2000 });
    replaceProviderModels(item, ["keep", "new"]);
    expect(item.models).toEqual(["keep", "new"]);
    expect(item.model_context_compaction_thresholds).toEqual({ keep: 2000 });
  });

  test("fingerprints equivalent MCP maps independently of insertion order", () => {
    const base: McpServerConfig = {
      id: "mcp",
      name: "MCP",
      enabled: true,
      transport: "stdio",
      url: "",
      bearer_token: "",
      headers: { beta: "2", alpha: "1" },
      command: "server",
      args: ["--stdio"],
      env: { ZED: "z", ALPHA: "a" },
    };
    expect(mcpConnectionFingerprint(base)).toBe(
      mcpConnectionFingerprint({
        ...base,
        headers: { alpha: "1", beta: "2" },
        env: { ALPHA: "a", ZED: "z" },
      }),
    );
  });
});
