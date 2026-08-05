// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { normalizeConfigShape } from "../src/lib/config";
import type { AppConfig } from "../src/lib/types";

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
