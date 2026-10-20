import { describe, expect, test } from "bun:test";
import bundledRegistry from "../src/lib/officialPluginRegistry.json";
import {
  fetchOfficialPluginRegistry,
  OFFICIAL_PLUGIN_REGISTRY_MAX_BYTES,
  OFFICIAL_PLUGIN_REGISTRY_URL,
  type OfficialPluginRegistryFetcher,
  findOfficialPlugin,
  parseOfficialPluginRegistry,
  projectOfficialPluginCatalog,
  toOfficialMarketplaceDocument,
} from "../src/lib/officialPluginRegistry";

describe("official plugin registry", () => {
  test("discovery separates channels, agent collaboration and orchestration without changing installation metadata", () => {
    const registry = parseOfficialPluginRegistry(bundledRegistry);
    const members = (
      category: "channels" | "collaboration" | "orchestration" | "automation" | "projects",
    ) =>
      projectOfficialPluginCatalog(registry, { installed: new Map(), category }).map(
        (plugin) => plugin.id,
      );
    expect(members("channels")).toEqual(["imessage"]);
    expect(members("collaboration")).toEqual(["chat-groups", "message-board"]);
    expect(members("orchestration")).toEqual(["goal", "graph"]);
    expect(members("automation")).toEqual(["cua-driver", "playwright"]);
    expect(members("projects")).toEqual(["asana", "linear"]);
    expect(registry.plugins.every((plugin) => plugin.discoveryCategory)).toBe(true);

    const imessage = findOfficialPlugin(registry, "imessage")!;
    const collaboration = findOfficialPlugin(registry, "chat-groups")!;
    expect(imessage.category).toBe("communication");
    expect(collaboration.category).toBe("communication");
    const transport = toOfficialMarketplaceDocument(registry);
    expect(transport.plugins.find((plugin) => plugin.name === "imessage")?.interface.category).toBe(
      "communication",
    );
    expect(JSON.stringify(transport)).not.toContain("discoveryCategory");
  });

  test("missing discovery metadata stays unclassified rather than guessing from a manifest category", () => {
    const entry = { ...bundledRegistry.plugins[0], discovery_category: undefined };
    const registry = parseOfficialPluginRegistry({ schema_version: 1, plugins: [entry] });
    expect(registry.plugins[0].category).toBe("communication");
    expect(
      projectOfficialPluginCatalog(registry, { installed: new Map(), category: "uncategorized" }),
    ).toHaveLength(1);
    expect(
      projectOfficialPluginCatalog(registry, { installed: new Map(), category: "channels" }),
    ).toEqual([]);
    expect(
      projectOfficialPluginCatalog(registry, { installed: new Map(), category: "collaboration" }),
    ).toEqual([]);
  });

  test.each([[null], [""], ["communication"], ["unknown"], [["channels"]], [1]])(
    "rejects invalid discovery category %j",
    (discovery_category) => {
      expect(() =>
        parseOfficialPluginRegistry({
          schema_version: 1,
          plugins: [{ ...bundledRegistry.plugins[0], discovery_category }],
        }),
      ).toThrow("discovery_category");
    },
  );

  test("category filtering intersects search and availability and preserves marketplace metadata", () => {
    const registry = parseOfficialPluginRegistry(bundledRegistry);
    const installed = new Map([["github", "0.2.0"]]);
    const development = projectOfficialPluginCatalog(registry, {
      installed,
      category: "development",
    });
    expect(development.length).toBeGreaterThan(1);
    expect(development.every((plugin) => plugin.discoveryCategory === "development")).toBe(true);
    expect(
      projectOfficialPluginCatalog(registry, {
        installed,
        category: "development",
        query: "github",
        filter: "installed",
      }).map((plugin) => plugin.id),
    ).toEqual(["github"]);
    expect(
      projectOfficialPluginCatalog(registry, {
        installed,
        category: "channels",
        query: "github",
      }),
    ).toEqual([]);
    expect(
      projectOfficialPluginCatalog(registry, {
        installed,
        category: "development",
        query: "github",
        filter: "available",
      }),
    ).toEqual([]);
    expect(
      toOfficialMarketplaceDocument(registry).plugins.find((plugin) => plugin.name === "github")
        ?.interface.category,
    ).toBe("development");
    const unclassified = {
      ...registry,
      plugins: [{ ...registry.plugins[0], discoveryCategory: undefined }],
    };
    expect(
      projectOfficialPluginCatalog(unclassified, { installed, category: "uncategorized" }),
    ).toHaveLength(1);
    expect(
      projectOfficialPluginCatalog(unclassified, { installed, category: "other" }),
    ).toHaveLength(0);
  });

  test.each([[null], [""], ["unknown"], ["Development"], [["development"]], [1]])(
    "rejects invalid category %j",
    (category) => {
      expect(() =>
        parseOfficialPluginRegistry({
          ...bundledRegistry,
          plugins: [{ ...bundledRegistry.plugins[0], category }],
        }),
      ).toThrow("category");
    },
  );

  test("parses the bundled official sources", () => {
    const registry = parseOfficialPluginRegistry(bundledRegistry);
    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      "chat-groups",
      "goal",
      "graph",
      "cua-driver",
      "message-board",
      "openagent-plugin-kit",
      "asana",
      "context7",
      "fakechat",
      "firebase",
      "github",
      "gitlab",
      "imessage",
      "laravel-boost",
      "langfuse",
      "linear",
      "playwright",
      "serena",
      "terraform",
      "openagent-theme-nova",
      "openagent-theme-vega",
      "openagent-theme-maia",
      "openagent-theme-lyra",
      "openagent-theme-mira",
      "openagent-theme-luma",
      "openagent-theme-sera",
      "openagent-theme-rhea",
      "openagent-theme-garden",
      "openagent-theme-rose-ink",
      "mermaid",
    ]);
    expect(findOfficialPlugin(registry, "goal")?.sourceUrl).toBe(
      "https://github.com/BANG404/openagent-goal",
    );
    expect(registry.plugins.every((plugin) => plugin.version === undefined)).toBe(true);
    expect(registry.plugins.every((plugin) => plugin.sourceUrl === plugin.repository)).toBe(true);
    expect(findOfficialPlugin(registry, "message-board")?.sourceUrl).toBe(
      "https://github.com/BANG404/openagent-message-board",
    );
    expect(findOfficialPlugin(registry, "openagent-plugin-kit")?.sourceUrl).toBe(
      "https://github.com/BANG404/openagent-plugin-kit",
    );
    expect(findOfficialPlugin(registry, "openagent-plugin-kit")?.sha256).toBeUndefined();
    expect(findOfficialPlugin(registry, "langfuse")?.sourceUrl).toBe(
      "https://github.com/BANG404/openagent-langfuse",
    );
    expect(findOfficialPlugin(registry, "langfuse")?.sha256).toBeUndefined();
    expect(findOfficialPlugin(registry, "discord")).toBeUndefined();
    expect(findOfficialPlugin(registry, "telegram")).toBeUndefined();
  });

  test("theme packages are discoverable in the themes category in both locales", () => {
    const registry = parseOfficialPluginRegistry(bundledRegistry);
    for (const locale of ["en", "zh"]) {
      const themes = projectOfficialPluginCatalog(registry, {
        installed: new Map(),
        locale,
        category: "themes",
      });
      expect(themes).toHaveLength(10);
      expect(themes.every((plugin) => plugin.id.startsWith("openagent-theme-"))).toBe(true);
      expect(
        projectOfficialPluginCatalog(registry, {
          installed: new Map(),
          locale,
          category: "themes",
          query: locale === "zh" ? "翠绿" : "emerald",
        }).map((plugin) => plugin.id),
      ).toEqual(["openagent-theme-garden"]);
    }
  });

  test("distinguishes the development assistant and message board in localized search", () => {
    const registry = parseOfficialPluginRegistry(bundledRegistry);
    for (const [locale, query, id] of [
      ["zh", "插件开发助手", "openagent-plugin-kit"],
      ["zh", "智能体留言板", "message-board"],
      ["en", "Plugin Developer", "openagent-plugin-kit"],
      ["en", "Agent Message Board", "message-board"],
      ["zh", "目标推进", "goal"],
      ["zh", "任务编排", "graph"],
      ["zh", "多智能体群聊", "chat-groups"],
      ["zh", "桌面操作", "cua-driver"],
      ["zh", "浏览器自动化", "playwright"],
      ["zh", "本地通道测试", "fakechat"],
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
    let requestInit: RequestInit | undefined;
    const registry = await fetchOfficialPluginRegistry(
      "https://registry.example.com/plugins.json",
      {
        fetchImpl: async (input, init) => {
          request = new Request(input, init);
          requestInit = init;
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
    expect(requestInit?.credentials).toBe("omit");
    expect(requestInit?.cache).toBe("no-store");
  });

  test("reads the current public catalog on every request", async () => {
    let requests = 0;
    const fetchImpl: OfficialPluginRegistryFetcher = async (input) => {
      expect(String(input)).toBe(OFFICIAL_PLUGIN_REGISTRY_URL);
      const plugin = { ...bundledRegistry.plugins[0], version: `1.0.${requests++}` };
      return new Response(JSON.stringify({ schema_version: 1, plugins: [plugin] }));
    };
    const first = await fetchOfficialPluginRegistry(undefined, { fetchImpl });
    const second = await fetchOfficialPluginRegistry(undefined, { fetchImpl });
    expect(first.plugins[0].version).toBe("1.0.0");
    expect(second.plugins[0].version).toBe("1.0.1");
    expect(requests).toBe(2);
  });

  test("rejects duplicate remote plugin IDs", () => {
    expect(() =>
      parseOfficialPluginRegistry({
        schema_version: 1,
        plugins: [bundledRegistry.plugins[0], bundledRegistry.plugins[0]],
      }),
    ).toThrow("duplicates");
  });

  test.each([
    ["HTTP failure", () => new Response("Unavailable", { status: 503 }), "HTTP 503"],
    ["invalid JSON", () => new Response("{"), "invalid JSON"],
    ["invalid schema", () => new Response('{"schema_version":2,"plugins":[]}'), "schema_version"],
    [
      "declared oversized body",
      () =>
        new Response("{}", {
          headers: { "content-length": String(OFFICIAL_PLUGIN_REGISTRY_MAX_BYTES + 1) },
        }),
      "2 MiB",
    ],
    [
      "streamed oversized body",
      () => new Response(" ".repeat(OFFICIAL_PLUGIN_REGISTRY_MAX_BYTES + 1)),
      "2 MiB",
    ],
  ] as const)("reports %s without a bundled fallback", async (_label, response, error) => {
    await expect(
      fetchOfficialPluginRegistry(undefined, {
        fetchImpl: async () => response(),
      }),
    ).rejects.toThrow(error);
  });

  test("aborts a stalled request at its deadline", async () => {
    let signal: AbortSignal | null | undefined;
    await expect(
      fetchOfficialPluginRegistry(undefined, {
        timeoutMs: 10,
        fetchImpl: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal;
            signal?.addEventListener("abort", () => reject(new Error("Timed out")), { once: true });
          }),
      }),
    ).rejects.toThrow("Timed out");
    expect(signal?.aborted).toBe(true);
  });
});
