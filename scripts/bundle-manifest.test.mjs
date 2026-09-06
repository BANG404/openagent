import { describe, expect, test } from "bun:test";
import { requireManifestEntry } from "./bundle-manifest.mjs";

describe("requireManifestEntry", () => {
  test("returns a direct manifest entry", () => {
    const entry = { file: "_app/entry.js" };

    expect(requireManifestEntry({ "src/entry.ts": entry }, "src/entry.ts")).toBe(entry);
  });

  test("resolves a source module emitted as a dynamic import", () => {
    const entry = {
      file: "_app/chunks/settings.js",
      dynamicImports: ["src/lib/components/SettingsView.svelte"],
    };

    expect(
      requireManifestEntry(
        { "_app/chunks/settings.js": entry },
        "src/lib/components/SettingsView.svelte",
      ),
    ).toBe(entry);
  });

  test("rejects a module absent from the manifest", () => {
    expect(() => requireManifestEntry({}, "src/missing.ts")).toThrow(
      "Missing Vite manifest entry: src/missing.ts",
    );
  });
});
