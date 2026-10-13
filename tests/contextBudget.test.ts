import { describe, expect, test } from "bun:test";
import { contextCompactionThreshold } from "../src/lib/contextBudget";
import { normalizeConfigShape } from "../src/lib/config";
import { createProviderConfig, replaceProviderModels } from "../src/lib/settingsConfig";
import { DEFAULT_APP_CONFIG } from "../src/lib/settingsDefaults";

describe("model context budgets", () => {
  test("window caps global and explicit thresholds without overwriting settings", () => {
    const provider = createProviderConfig();
    provider.models = ["small", "large"];
    provider.model_context_windows = { small: 128_000, large: 1_000_000 };
    provider.model_context_compaction_thresholds = { large: 80_000 };
    const config = { ...DEFAULT_APP_CONFIG, providers: [provider] };
    expect(contextCompactionThreshold(config, { provider_id: provider.id, model: "small" })).toBe(
      115_200,
    );
    expect(contextCompactionThreshold(config, { provider_id: provider.id, model: "large" })).toBe(
      80_000,
    );
    expect(contextCompactionThreshold(config, { provider_id: provider.id, model: "unknown" })).toBe(
      200_000,
    );
    expect(config.context_compaction_threshold).toBe(200_000);
  });

  test("old settings have no inferred window and stale or invalid windows are removed", () => {
    const provider = createProviderConfig();
    provider.models = ["model"];
    delete provider.model_context_windows;
    expect(
      normalizeConfigShape({ ...DEFAULT_APP_CONFIG, providers: [provider] }).providers[0]
        .model_context_windows,
    ).toEqual({});
    provider.model_context_windows = { model: 128_000, removed: 128_000, invalid: -1 };
    expect(
      normalizeConfigShape({ ...DEFAULT_APP_CONFIG, providers: [provider] }).providers[0]
        .model_context_windows,
    ).toEqual({ model: 128_000 });
    replaceProviderModels(provider, []);
    expect(provider.model_context_windows).toEqual({});
  });
});
