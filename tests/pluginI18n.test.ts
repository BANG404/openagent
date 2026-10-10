import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  parsePluginI18n,
  pluginText,
  pluginLocaleFallback,
  pluginLanguageName,
  pluginCommandText,
} from "../src/lib/pluginI18n";
import {
  BUNDLED_OFFICIAL_PLUGIN_REGISTRY,
  projectOfficialPluginCatalog,
} from "../src/lib/officialPluginRegistry";
import { PLATFORM_LOCALES } from "../src/lib/platformLocales";
test("message board declares complete platform metadata before installation", () => {
  const plugin = BUNDLED_OFFICIAL_PLUGIN_REGISTRY.plugins.find(
    (plugin) => plugin.id === "message-board",
  )!;
  expect([...plugin.i18n!.supported_locales].sort()).toEqual([...PLATFORM_LOCALES].sort());
  const cards = projectOfficialPluginCatalog(BUNDLED_OFFICIAL_PLUGIN_REGISTRY, {
    installed: new Map(),
    locale: "zh",
    query: "订阅",
  });
  expect(cards.map((card) => card.id)).toEqual(["message-board"]);
  expect(cards[0].description).toContain("持久化频道");
  expect(pluginLanguageName("zh")).toBe("中文");
});
test("configuration presentation keys are admitted and localized", () => {
  const i18n = parsePluginI18n({
    supported_locales: ["en", "zh"],
    default_locale: "en",
    translations: {
      en: { display_name: "Fixture", "configuration.client-id.label": "Client ID" },
      zh: { display_name: "配置", "configuration.client-id.label": "客户端 ID" },
    },
  });
  expect(pluginText(i18n, "zh", "configuration.client-id.label", "fallback")).toBe("客户端 ID");
});
test("every official package source and marketplace entry declares the complete platform locale set", () => {
  for (const entry of BUNDLED_OFFICIAL_PLUGIN_REGISTRY.plugins) {
    const manifest = JSON.parse(
      readFileSync(new URL(`../plugins/${entry.id}/plugin.json`, import.meta.url), "utf8"),
    );
    const sourceI18n = manifest.extensions?.openagent?.i18n;
    expect(sourceI18n, entry.id).toBeDefined();
    expect([...sourceI18n.supported_locales].sort(), entry.id).toEqual(
      [...PLATFORM_LOCALES].sort(),
    );
    expect(entry.version, entry.id).toBe(manifest.version);
    expect(entry.i18n, entry.id).toEqual(sourceI18n);
  }
});
test("locale resolves exact, base, and declared fallback without inventing support", () => {
  const i18n = parsePluginI18n({
    supported_locales: ["en", "zh", "en-US"],
    default_locale: "en",
    translations: {
      en: { display_name: "Board", description: "Messages" },
      zh: { display_name: "留言板", description: "消息" },
      "en-US": { display_name: "US Board", description: "US messages" },
    },
  })!;
  expect(pluginText(i18n, "en-US", "display_name", "")).toBe("US Board");
  expect(pluginText(i18n, "zh-CN", "description", "")).toBe("消息");
  expect(pluginLocaleFallback(i18n, "fr")).toBe("en");
  expect(pluginLocaleFallback(i18n, "zh-CN")).toBeNull();
  expect(pluginText(undefined, "zh", "description", "Legacy")).toBe("Legacy");
});
test("installed manifests refresh catalog language authority, including unknown support", () => {
  const registry = BUNDLED_OFFICIAL_PLUGIN_REGISTRY;
  const projected = projectOfficialPluginCatalog(registry, {
    installed: new Map([["message-board", "1.0.0"]]),
    installedI18n: new Map([["message-board", null]]),
    locale: "zh",
  });
  expect(projected.find((plugin) => plugin.id === "message-board")!.i18n).toBeUndefined();
});
test("declarations reject misleading language lists and incomplete translations", () => {
  const good = BUNDLED_OFFICIAL_PLUGIN_REGISTRY.plugins.find(
    (plugin) => plugin.id === "message-board",
  )!.i18n!;
  for (const mutate of [
    (i: typeof good) => i.supported_locales.push("EN"),
    (i: typeof good) => (i.default_locale = "fr"),
    (i: typeof good) => delete i.translations.zh.description,
    (i: typeof good) => (i.translations.zh.description = " "),
  ]) {
    const input = structuredClone(good);
    mutate(input);
    expect(() => parsePluginI18n(input)).toThrow();
  }
  expect(() => parsePluginI18n(null)).toThrow();
});
test("description translations are required only when the descriptor has a description", () => {
  const input = {
    supported_locales: ["en"],
    default_locale: "en",
    translations: { en: { display_name: "Minimal plugin", description: "Optional copy" } },
  };
  expect(parsePluginI18n(input)).toBeDefined();
  const withoutDescription = {
    ...input,
    translations: { en: { display_name: "Minimal plugin" } },
  };
  expect(parsePluginI18n(withoutDescription)).toBeDefined();
  expect(() => parsePluginI18n(withoutDescription, ["display_name", "description"])).toThrow();
});
test("command labels follow the current locale while command IDs stay fixed", () => {
  const i18n = {
    supported_locales: ["en", "zh"],
    default_locale: "en",
    translations: { en: { "commands.run.label": "Run" }, zh: { "commands.run.label": "运行" } },
  };
  const spec = { name: "sample:run", plugin_i18n: i18n };
  expect(pluginCommandText(spec, "zh", "label", "Run")).toBe("运行");
  expect(pluginCommandText(spec, "en", "label", "Run")).toBe("Run");
  expect(spec.name).toBe("sample:run");
});
test("catalog accepts dotted component IDs and bounds notice keys by UTF-8 bytes", () => {
  const messages = {
    display_name: "Board",
    description: "Messages",
    "commands.run.task.label": "Run",
    "commands.run.task.description": "Start",
    "sidebar.board.view.title": "Board",
  };
  const input = { supported_locales: ["en"], default_locale: "en", translations: { en: messages } };
  expect(parsePluginI18n(input)).toBeDefined();
  Object.assign(messages, { [`notice.${"界".repeat(41)}`]: "Busy" });
  expect(() => parsePluginI18n(input)).toThrow();
});
