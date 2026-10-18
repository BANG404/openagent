import { expect, spyOn, test } from "bun:test";
import { applyPluginThemeFonts, pluginThemeFontKey } from "../src/lib/pluginThemeFonts";
import type { AgentPluginSummary } from "../src/lib/types";

const theme = {
  id: "theme",
  plugin_type: "theme",
  enabled: true,
  theme: { fonts: [{ family: "Probe", entry: "fonts/probe.woff2" }] },
} as AgentPluginSummary;
const config = { theme_plugin: "theme", agent_plugins_enabled: {} };
const asset = { content: btoa("wOF2"), mime: "font/woff2", encoding: "base64" as const };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("font identity survives equivalent settings previews and unrelated catalog changes", () => {
  const key = pluginThemeFontKey([theme], config);
  expect(pluginThemeFontKey([structuredClone(theme)], structuredClone(config))).toBe(key);
  expect(pluginThemeFontKey([{ ...theme, description: "refreshed" }], config)).toBe(key);
  expect(pluginThemeFontKey([theme], { ...config, agent_plugins_enabled: { other: false } })).toBe(
    key,
  );
  for (const changed of [
    { ...theme, version: "2.0.0" },
    { ...theme, path: "replacement-package" },
    { ...theme, theme: { ...theme.theme!, fonts: [] } },
    { ...theme, error: "unavailable" },
  ])
    expect(pluginThemeFontKey([changed], config)).not.toBe(key);
  expect(
    pluginThemeFontKey([theme], { ...config, agent_plugins_enabled: { theme: false } }),
  ).not.toBe(key);
  expect(pluginThemeFontKey([], config)).not.toBe(key);
});

test("selected font is decoded, registered and removed; disabled and unselected packages are never read", async () => {
  const registered = new Set<FontFace>();
  let reads = 0;
  const face = { load: async () => face } as unknown as FontFace;
  const cleanup = applyPluginThemeFonts(
    [theme],
    config,
    async (id, entry) => {
      expect([id, entry]).toEqual(["theme", "fonts/probe.woff2"]);
      reads++;
      return asset;
    },
    registered as unknown as FontFaceSet,
    (family, bytes, descriptors) => {
      expect(family).toBe("Probe");
      expect(new TextDecoder().decode(bytes)).toBe("wOF2");
      expect(descriptors).toMatchObject({ weight: "normal", style: "normal" });
      return face;
    },
  );
  await flush();
  expect(registered.has(face)).toBe(true);
  cleanup();
  expect(registered.size).toBe(0);
  for (const selection of ["", "other", "theme"]) {
    applyPluginThemeFonts(
      [theme],
      { theme_plugin: selection, agent_plugins_enabled: { theme: false } },
      async () => {
        reads++;
        return asset;
      },
      registered as unknown as FontFaceSet,
    );
  }
  expect(reads).toBe(1);
});

test("a retired font read or decoder load cannot register after switching theme", async () => {
  for (const pendingStage of ["read", "decode"]) {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const registered = new Set<FontFace>();
    const face = {
      load: async () => {
        if (pendingStage === "decode") await pending;
        return face;
      },
    } as unknown as FontFace;
    const cleanup = applyPluginThemeFonts(
      [theme],
      config,
      async () => {
        if (pendingStage === "read") await pending;
        return asset;
      },
      registered as unknown as FontFaceSet,
      () => face,
    );
    await flush();
    cleanup();
    finish();
    await flush();
    expect(registered.size).toBe(0);
  }
});

test("failed font reads and decoding retain fallback without rejecting the appearance effect", async () => {
  const warning = spyOn(console, "warn").mockImplementation(() => {});
  try {
    for (const stage of ["read", "decode", "encoding"]) {
      const registered = new Set<FontFace>();
      const cleanup = applyPluginThemeFonts(
        [theme],
        config,
        async () => {
          if (stage === "read") throw new Error("Unavailable file");
          return stage === "encoding" ? { ...asset, encoding: undefined } : asset;
        },
        registered as unknown as FontFaceSet,
        () =>
          ({
            load: async () => {
              throw new Error("Invalid font");
            },
          }) as unknown as FontFace,
      );
      await flush();
      expect(registered.size).toBe(0);
      cleanup();
    }
    expect(warning).toHaveBeenCalledTimes(3);
  } finally {
    warning.mockRestore();
  }
});
