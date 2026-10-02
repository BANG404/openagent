import { describe, expect, test } from "bun:test";
import bundledRegistry from "../src/lib/officialPluginRegistry.json";
import {
  fetchOfficialPluginRegistry,
  findOfficialPlugin,
  parseOfficialPluginRegistry,
  toOfficialMarketplaceDocument,
} from "../src/lib/officialPluginRegistry";

describe("official plugin registry", () => {
  test("parses the bundled official sources", () => {
    const registry = parseOfficialPluginRegistry(bundledRegistry);
    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      "chat-groups",
      "goal",
      "graph",
      "cua-driver",
    ]);
    expect(findOfficialPlugin(registry, "goal")?.sourceUrl).toBe(
      "https://github.com/BANG404/openagent-goal.git",
    );
  });

  test("converts entries to the existing marketplace protocol", () => {
    const registry = parseOfficialPluginRegistry({
      schema_version: 1,
      plugins: [
        {
          id: "demo-plugin",
          display_name: "Demo",
          repository: "https://example.com/demo",
          source_url: "https://example.com/demo.git",
        },
      ],
    });
    expect(toOfficialMarketplaceDocument(registry)).toEqual({
      name: "openagent-official",
      interface: { displayName: "OpenAgent Official Plugins" },
      plugins: [
        {
          name: "demo-plugin",
          interface: { displayName: "Demo" },
          source: { source: "url", url: "https://example.com/demo.git" },
          policy: {
            installation: "AVAILABLE",
            authentication: "ON_INSTALL",
            products: ["CODEX"],
          },
        },
      ],
    });
  });

  test.each([
    ["http://example.com/plugin", "source_url"],
    ["https://user:pass@example.com/plugin", "source_url"],
    ["https://example.com/plugin#fragment", "source_url"],
  ])("rejects unsafe %s", (sourceUrl, field) => {
    expect(() =>
      parseOfficialPluginRegistry({
        schema_version: 1,
        plugins: [
          {
            id: "unsafe-plugin",
            display_name: "Unsafe",
            repository: "https://example.com/repository",
            [field]: sourceUrl,
          },
        ],
      }),
    ).toThrow();
  });

  test("requires a valid digest when one is supplied", () => {
    expect(() =>
      parseOfficialPluginRegistry({
        schema_version: 1,
        plugins: [
          {
            id: "demo-plugin",
            display_name: "Demo",
            repository: "https://example.com/repository",
            source_url: "https://example.com/plugin.zip",
            sha256: "sha256:not-a-digest",
          },
        ],
      }),
    ).toThrow(/sha256/);
  });

  test("fetches a public registry without an authorization header", async () => {
    let request: Request | undefined;
    const registry = await fetchOfficialPluginRegistry(
      "https://registry.example.com/plugins.json",
      {
        fetchImpl: async (input, init) => {
          request = new Request(input, init);
          return new Response(
            JSON.stringify({
              schema_version: 1,
              plugins: [
                {
                  id: "demo-plugin",
                  display_name: "Demo",
                  repository: "https://example.com/repository",
                  source_url: "https://example.com/demo.git",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      },
    );
    expect(registry.plugins[0]?.id).toBe("demo-plugin");
    expect(request?.headers.has("authorization")).toBe(false);
    expect(request?.headers.get("accept")).toBe("application/json");
  });
});
