// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { normalizeConfigShape } from "../src/lib/config";
import { encodeModelBinding } from "../src/lib/modelBinding";
import { modelSupportsVision } from "../src/lib/modelCapabilities";
import type { AppConfig } from "../src/lib/types";

describe("modelSupportsVision", () => {
  const config = normalizeConfigShape({
    providers: [
      {
        id: "provider-a",
        name: "Provider A",
        provider: "openai",
        enabled: true,
        api_key: "",
        models: ["shared", "vision"],
        model_vision_enabled: { vision: true },
      },
      {
        id: "provider-b",
        name: "Provider B",
        provider: "openai",
        enabled: true,
        api_key: "",
        models: ["shared"],
        model_vision_enabled: { shared: true },
      },
    ],
  } as unknown as AppConfig);

  test("uses the exact provider and model capability", () => {
    expect(modelSupportsVision(config, encodeModelBinding("provider-a", "vision"))).toBe(true);
    expect(modelSupportsVision(config, encodeModelBinding("provider-a", "shared"))).toBe(false);
    expect(modelSupportsVision(config, encodeModelBinding("provider-b", "shared"))).toBe(true);
  });

  test("defaults malformed and missing bindings to disabled", () => {
    expect(modelSupportsVision(config, "")).toBe(false);
    expect(modelSupportsVision(config, encodeModelBinding("missing", "vision"))).toBe(false);
  });
});
