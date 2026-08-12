// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  applyDetectedProviderModels,
  applyFetchedProviderModels,
  createProviderConfig,
  mcpConnectionFingerprint,
  repairModelBindings,
  replaceProviderModels,
  selectModelBindingProvider,
  settingsConfigChanged,
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
    model_reasoning_efforts: {},
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
      name: "Anthropic Claude Node",
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

  test("selecting a provider replaces a binding with its first available model", () => {
    const draft = config([
      provider("first", true, ["first-a"]),
      provider("second", true, ["second-a", "second-b"]),
    ]);
    const binding = draft.defaults.chat_model;
    binding.provider_id = "first";
    binding.model = "first-a";

    selectModelBindingProvider(draft, binding, "second");

    expect(binding).toEqual({ provider_id: "second", model: "second-a" });
  });

  test("selecting an unavailable provider clears the complete binding", () => {
    const draft = config([provider("disabled", false, ["stale"])]);
    const binding = draft.defaults.chat_model;

    selectModelBindingProvider(draft, binding, "disabled");

    expect(binding).toEqual({ provider_id: "", model: "" });
  });

  test("prunes per-model settings when provider models are replaced", () => {
    const item = provider("enabled", true, ["old", "keep"], { old: 1000, keep: 2000 });
    item.model_reasoning_efforts = { old: "low", keep: "high" };
    replaceProviderModels(item, ["keep", "new"]);
    expect(item.models).toEqual(["keep", "new"]);
    expect(item.model_context_compaction_thresholds).toEqual({ keep: 2000 });
    expect(item.model_reasoning_efforts).toEqual({ keep: "high" });
  });

  test("enables a provider when a fetched model catalog is non-empty", () => {
    const item = provider("disabled", false, ["old"], { old: 1000 });

    expect(applyFetchedProviderModels(item, ["new"])).toBe(true);
    expect(item.enabled).toBe(true);
    expect(item.models).toEqual(["new"]);
    expect(item.model_context_compaction_thresholds).toEqual({});
  });

  test("keeps a provider disabled when a fetched model catalog is empty", () => {
    const item = provider("enabled", true, ["old"]);

    expect(applyFetchedProviderModels(item, [])).toBe(false);
    expect(item.enabled).toBe(false);
    expect(item.models).toEqual([]);
  });

  test("enables a provider when model detection succeeds with a non-empty catalog", () => {
    const item = provider("disabled", false, ["old"]);

    expect(applyDetectedProviderModels(item, ["new"], true)).toBe(true);
    expect(item.enabled).toBe(true);
    expect(item.models).toEqual(["new"]);
  });

  test("keeps a provider disabled when model detection fails", () => {
    const item = provider("enabled", true, ["old"]);

    expect(applyDetectedProviderModels(item, ["new"], false)).toBe(false);
    expect(item.enabled).toBe(false);
    expect(item.models).toEqual(["new"]);
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

  test("does not mark an unchanged settings snapshot for persistence", () => {
    const snapshot = config([provider("enabled", true, ["chat"])]);
    const acceptedFingerprint = JSON.stringify(snapshot);

    expect(settingsConfigChanged(structuredClone(snapshot), acceptedFingerprint)).toBe(false);
    snapshot.providers = [];
    expect(settingsConfigChanged(snapshot, acceptedFingerprint)).toBe(true);
  });
});
