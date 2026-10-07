import { describe, expect, test } from "bun:test";
import bundledRegistry from "../src/lib/officialPluginRegistry.json";
import {
  fetchOfficialPluginRegistry,
  findOfficialPlugin,
  parseOfficialPluginRegistry,
  projectOfficialPluginCatalog,
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
      "message-board",
      "openagent-plugin-kit",
    ]);
    expect(findOfficialPlugin(registry, "goal")?.sourceUrl).toBe(
      "https://github.com/BANG404/openagent-goal.git",
    );
    expect(registry.plugins.map((plugin) => plugin.version)).toEqual([
      "2.2.0",
      "2.2.2",
      "1.0.6",
      "1.3.0",
      "1.1.1",
      "1.5.0",
    ]);
    expect(findOfficialPlugin(registry, "message-board")?.sourceUrl).toBe(
      "https://github.com/BANG404/message-board.git",
    );
    expect(findOfficialPlugin(registry, "openagent-plugin-kit")?.sourceUrl).toBe(
      "https://github.com/BANG404/openagent-plugin-kit.git",
    );
  });

  test("distinguishes the development assistant and message board in localized search", () => {
    const registry = parseOfficialPluginRegistry(bundledRegistry);
    for (const [locale, query, id] of [
      ["zh", "插件开发助手", "openagent-plugin-kit"],
      ["zh", "留言板", "message-board"],
      ["en", "Plugin Developer", "openagent-plugin-kit"],
      ["en", "Message Board", "message-board"],
    ]) {
      expect(
        projectOfficialPluginCatalog(registry, { installed: new Map(), locale, query }).map(
          (entry) => entry.id,
        ),
      ).toEqual([id]);
    }
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

  test("projects install state, updates, search, and filters for the store", () => {
    const registry = parseOfficialPluginRegistry({
      schema_version: 1,
      plugins: [
        {
          id: "alpha-plugin",
          display_name: "Alpha",
          description: "A workspace helper",
          repository: "https://example.com/alpha",
          source_url: "https://example.com/alpha.git",
          version: "1.2.0",
        },
        {
          id: "beta-plugin",
          display_name: "Beta",
          description: "A graph helper",
          repository: "https://example.com/beta",
          source_url: "https://example.com/beta.git",
          version: "2.0.0",
        },
      ],
    });
    const installed = new Map([["alpha-plugin", "1.0.0"]]);
    const all = projectOfficialPluginCatalog(registry, {
      installed,
      updates: new Set(["alpha-plugin"]),
    });
    expect(all.map((entry) => [entry.id, entry.installed, entry.updateAvailable])).toEqual([
      ["alpha-plugin", true, true],
      ["beta-plugin", false, false],
    ]);
    expect(
      projectOfficialPluginCatalog(registry, {
        installed,
        query: "graph",
        filter: "available",
      }).map((entry) => entry.id),
    ).toEqual(["beta-plugin"]);
  });

  test.each([
    ["http://example.com/plugin", "source_url"],
    ["https://user:pass@example.com/plugin", "source_url"],
    ["https://example.com/plugin?token=secret", "source_url"],
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
