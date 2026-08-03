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
      network: "enabled",
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
});
