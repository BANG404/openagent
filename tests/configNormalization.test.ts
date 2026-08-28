// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { normalizeConfigShape } from "../src/lib/config";
import type { AppConfig } from "../src/lib/types";

describe("configuration version", () => {
  test("materializes the current version at the transport boundary", () => {
    expect(normalizeConfigShape({} as AppConfig).config_version).toBe(1);
    expect(normalizeConfigShape({ config_version: 99 } as AppConfig).config_version).toBe(1);
  });
});

describe("onboarding completion config", () => {
  test("defaults older configuration payloads to incomplete", () => {
    expect(normalizeConfigShape({} as AppConfig).onboarding_completed).toBe(false);
  });

  test("preserves completed onboarding", () => {
    expect(
      normalizeConfigShape({ onboarding_completed: true } as AppConfig).onboarding_completed,
    ).toBe(true);
  });
});

describe("diagnostic log collection config", () => {
  test("defaults to enabled for older configuration payloads", () => {
    const normalized = normalizeConfigShape({} as AppConfig);

    expect(normalized.diagnostic_log_collection_enabled).toBe(true);
  });

  test("preserves an explicit opt-out", () => {
    const normalized = normalizeConfigShape({
      diagnostic_log_collection_enabled: false,
    } as AppConfig);

    expect(normalized.diagnostic_log_collection_enabled).toBe(false);
  });
});

describe("web search enablement config", () => {
  test("defaults both enablement layers on for older payloads", () => {
    const normalized = normalizeConfigShape({ web_search: {} } as unknown as AppConfig);

    expect(normalized.web_search.enabled).toBe(true);
    expect(normalized.web_search.provider_enabled).toBe(true);
  });

  test("preserves independent feature and provider opt-outs", () => {
    const normalized = normalizeConfigShape({
      web_search: {
        enabled: false,
        provider_enabled: false,
        provider: "tavily",
        brave_api_key: "",
        tavily_api_key: "retained-secret",
        searxng_base_url: "",
      },
    } as AppConfig);

    expect(normalized.web_search.enabled).toBe(false);
    expect(normalized.web_search.provider_enabled).toBe(false);
    expect(normalized.web_search.tavily_api_key).toBe("retained-secret");
  });
});

describe("model retry config", () => {
  test("defaults each model to three retries with a thirty second interval", () => {
    const normalized = normalizeConfigShape({} as AppConfig);

    expect(normalized.model_retry.retry_count).toBe(3);
    expect(normalized.model_retry.retry_delay_ms).toBe(30_000);
  });

  test("preserves an explicitly configured retry interval", () => {
    const normalized = normalizeConfigShape({
      model_retry: {
        retry_count: 2,
        retry_delay_ms: 12_000,
        chat_queue: [],
        flash_queue: [],
      },
    } as AppConfig);

    expect(normalized.model_retry.retry_count).toBe(2);
    expect(normalized.model_retry.retry_delay_ms).toBe(12_000);
  });
});

describe("context compaction config", () => {
  test("defaults a missing summary threshold to two hundred thousand tokens", () => {
    const normalized = normalizeConfigShape({} as AppConfig);

    expect(normalized.context_compaction_threshold).toBe(200_000);
  });

  test("preserves an explicitly configured summary threshold", () => {
    const normalized = normalizeConfigShape({
      context_compaction_threshold: 48_000,
    } as AppConfig);

    expect(normalized.context_compaction_threshold).toBe(48_000);
  });
});

describe("model reasoning effort config", () => {
  test("retains only configured models explicitly declared to support reasoning effort", () => {
    const normalized = normalizeConfigShape({
      providers: [
        {
          id: "test",
          name: "Test",
          provider: "openai",
          enabled: true,
          api_key: "",
          models: ["reasoning", "ordinary"],
          model_reasoning_efforts: { reasoning: "high", removed: "low" },
          model_reasoning_effort_enabled: { reasoning: true, ordinary: false, removed: true },
        },
      ],
    } as unknown as AppConfig);

    expect(normalized.providers[0].model_reasoning_efforts).toEqual({ reasoning: "high" });
    expect(normalized.providers[0].model_reasoning_effort_enabled).toEqual({ reasoning: true });
  });
});

describe("automatic memory retrieval config", () => {
  test("defaults older configuration payloads to agent-directed retrieval", () => {
    expect(normalizeConfigShape({} as AppConfig).memory_retrieval_enabled).toBe(false);
  });

  test("preserves an explicit per-turn retrieval opt-in", () => {
    expect(
      normalizeConfigShape({ memory_retrieval_enabled: true } as AppConfig)
        .memory_retrieval_enabled,
    ).toBe(true);
  });
});

describe("Flash suggestions config", () => {
  test("defaults older configuration payloads to enabled suggestions", () => {
    const normalized = normalizeConfigShape({} as AppConfig);

    expect(normalized.flash_agents.suggestions).toEqual({ enabled: true, prompt: "" });
  });

  test("drops the removed personalized greeting setting", () => {
    const normalized = normalizeConfigShape({
      flash_agents: {
        new_conversation_summary: { enabled: false, prompt: "legacy" },
      },
    } as unknown as AppConfig);

    expect(normalized.flash_agents.suggestions).toEqual({ enabled: true, prompt: "" });
    expect(normalized.flash_agents).not.toHaveProperty("new_conversation_summary");
  });
});

describe("messaging channel config", () => {
  test("materializes every channel for older configuration payloads", () => {
    const normalized = normalizeConfigShape({} as AppConfig);

    expect(normalized.channels).toEqual({
      feishu: {
        enabled: false,
        app_id: "",
        app_secret: "",
        domain: "feishu",
        allowed_chat_ids: [],
      },
      telegram: { enabled: false, bot_token: "", allowed_chat_ids: [] },
      qq: { enabled: false, app_id: "", client_secret: "", allowed_user_ids: [] },
      wechat: { enabled: false, allowed_user_ids: [] },
      discord: { enabled: false, bot_token: "", allowed_channel_ids: [] },
      slack: { enabled: false, bot_token: "", app_token: "", allowed_channel_ids: [] },
    });
  });

  test("preserves configured credentials and allowlists", () => {
    const normalized = normalizeConfigShape({
      channels: {
        telegram: { enabled: true, bot_token: "token", allowed_chat_ids: ["42"] },
        slack: {
          enabled: true,
          bot_token: "xoxb-token",
          app_token: "xapp-token",
          allowed_channel_ids: ["C123"],
        },
      },
    } as AppConfig);

    expect(normalized.channels.telegram).toEqual({
      enabled: true,
      bot_token: "token",
      allowed_chat_ids: ["42"],
    });
    expect(normalized.channels.slack).toEqual({
      enabled: true,
      bot_token: "xoxb-token",
      app_token: "xapp-token",
      allowed_channel_ids: ["C123"],
    });
  });
});

describe("permission profile config", () => {
  test("defaults older payloads to host read and workspace write access", () => {
    const normalized = normalizeConfigShape({} as AppConfig);

    expect(normalized.permission_profile).toEqual({
      enforcement: "managed",
      file_system: {
        entries: [
          { path: { kind: "host_root" }, access: "read" },
          { path: { kind: "workspace" }, access: "write" },
        ],
      },
      network: "restricted",
    });
  });

  test("preserves explicit read and deny entries", () => {
    const normalized = normalizeConfigShape({
      permission_profile: {
        enforcement: "managed",
        file_system: {
          entries: [
            { path: { kind: "workspace" }, access: "read" },
            { path: { kind: "workspace", subpath: ".agents" }, access: "deny" },
          ],
        },
        network: "restricted",
      },
    } as AppConfig);

    expect(normalized.permission_profile).toEqual({
      enforcement: "managed",
      file_system: {
        entries: [
          { path: { kind: "workspace" }, access: "read" },
          { path: { kind: "workspace", subpath: ".agents" }, access: "deny" },
        ],
      },
      network: "restricted",
    });
  });

  test("does not preserve the removed external isolation profile", () => {
    const normalized = normalizeConfigShape({
      permission_profile: {
        enforcement: "external",
        network: "enabled",
      },
    } as unknown as AppConfig);

    expect(normalized.permission_profile).toEqual({
      enforcement: "managed",
      file_system: {
        entries: [
          { path: { kind: "host_root" }, access: "read" },
          { path: { kind: "workspace" }, access: "write" },
        ],
      },
      network: "restricted",
    });
  });
});

describe("approval mode config", () => {
  test("defaults missing or unsupported values to off", () => {
    expect(normalizeConfigShape({} as AppConfig).approval_mode).toBe("off");
    expect(
      normalizeConfigShape({ approval_mode: "sandbox" } as unknown as AppConfig).approval_mode,
    ).toBe("off");
  });

  test("enables the approval Flash task only for automatic approval", () => {
    const automatic = normalizeConfigShape({ approval_mode: "auto" } as AppConfig);
    const manual = normalizeConfigShape({ approval_mode: "manual" } as AppConfig);

    expect(automatic.flash_agents.tool_approval.enabled).toBe(true);
    expect(manual.flash_agents.tool_approval.enabled).toBe(false);
  });
});
