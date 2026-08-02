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
