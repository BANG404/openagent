// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROVIDER_CATALOG, providerIconPath } from "$lib/providerCatalog";

describe("provider catalog icons", () => {
  test("every provider type resolves to a bundled icon", () => {
    for (const provider of PROVIDER_CATALOG) {
      const iconPath = providerIconPath(provider.value);
      expect(iconPath).toMatch(/^\/assets\/providers\/.+\.(?:png|svg)$/);
      expect(existsSync(join(import.meta.dir, "..", "static", iconPath.slice(1)))).toBe(true);
    }
  });

  test("semantic aliases use the matching platform brand", () => {
    expect(providerIconPath("anthropic")).toEndWith("/anthropic.svg");
    expect(providerIconPath("gemini")).toEndWith("/google.svg");
    expect(providerIconPath("xai")).toEndWith("/grok.svg");
    expect(providerIconPath("chatgpt")).toEndWith("/openai.svg");
  });
});
