import type { AgentPluginSummary, AppConfig } from "$lib/types";

type FontAsset = { content: string; mime: string; encoding?: "base64" };

/** Only package/font changes invalidate registered faces, not settings previews. */
export function pluginThemeFontKey(
  plugins: AgentPluginSummary[],
  config: Pick<AppConfig, "theme_plugin" | "agent_plugins_enabled"> | null,
): string {
  const plugin = selectedTheme(plugins, config);
  return JSON.stringify(
    plugin ? [plugin.id, plugin.path, plugin.version, plugin.theme?.fonts ?? []] : null,
  );
}

function selectedTheme(
  plugins: AgentPluginSummary[],
  config: Pick<AppConfig, "theme_plugin" | "agent_plugins_enabled"> | null,
) {
  return plugins.find(
    (item) =>
      item.id === config?.theme_plugin &&
      item.plugin_type === "theme" &&
      !item.error &&
      (config?.agent_plugins_enabled?.[item.id] ?? item.enabled),
  );
}

/** Register only the selected enabled package's faces; retire pending loads on cleanup. */
export function applyPluginThemeFonts(
  plugins: AgentPluginSummary[],
  config: Pick<AppConfig, "theme_plugin" | "agent_plugins_enabled"> | null,
  readAsset: (pluginId: string, entry: string) => Promise<FontAsset>,
  fonts: FontFaceSet = document.fonts,
  createFace = (family: string, bytes: ArrayBuffer, descriptors: FontFaceDescriptors) =>
    new FontFace(family, bytes, descriptors),
): () => void {
  const plugin = selectedTheme(plugins, config);
  let retired = false;
  const registered: FontFace[] = [];
  for (const font of plugin?.theme?.fonts ?? []) {
    void (async () => {
      const asset = await readAsset(plugin!.id, font.entry);
      if (retired) return;
      if (asset.encoding !== "base64" || !/^font\/(woff2?|ttf|otf)$/.test(asset.mime))
        throw new Error("Invalid theme font response");
      const binary = atob(asset.content);
      const buffer = new ArrayBuffer(binary.length);
      const bytes = new Uint8Array(buffer);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const face = createFace(font.family, buffer, {
        weight: font.weight ?? "normal",
        style: font.style ?? "normal",
        display: "swap",
      });
      await face.load();
      if (!retired) {
        fonts.add(face);
        registered.push(face);
      }
    })().catch((error: unknown) => {
      if (!retired) console.warn("Plugin theme font could not be loaded", error);
    });
  }
  return () => {
    retired = true;
    for (const face of registered) fonts.delete(face);
  };
}
