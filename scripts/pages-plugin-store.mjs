import { isPluginDiscoveryCategory } from "../src/lib/pluginDiscoveryCategories.ts";

/** @typedef {{ id: string; category?: string; discovery_category?: string; display_name: string; description?: string; repository: string; i18n?: { translations?: Record<string, Record<string, string>> } }} StorePlugin */

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&#39;");
}

/** Render reviewed discovery metadata without private dependencies or release API requests.
 * @param {{ schema_version: number; plugins: StorePlugin[] }} registry
 */
export function renderPluginStore(registry) {
  if (registry.schema_version !== 1) throw new Error("Unsupported plugin registry schema");
  const ids = new Set();
  return registry.plugins
    .map((plugin) => {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(plugin.id) || ids.has(plugin.id)) {
        throw new Error(`Invalid or duplicate plugin id: ${plugin.id}`);
      }
      ids.add(plugin.id);
      const repository = new URL(plugin.repository);
      if (
        repository.origin !== "https://github.com" ||
        !/^\/[\w.-]+\/[\w.-]+\/?$/.test(repository.pathname) ||
        repository.search ||
        repository.hash ||
        repository.username ||
        repository.password
      ) {
        throw new Error(`Invalid plugin repository: ${plugin.id}`);
      }
      const category = plugin.discovery_category ?? "uncategorized";
      if (
        plugin.discovery_category !== undefined &&
        !isPluginDiscoveryCategory(plugin.discovery_category)
      )
        throw new Error(`Invalid plugin discovery category: ${plugin.id}`);
      /** @param {string} field @param {string} fallback */
      const localized = (field, fallback) => {
        const en = plugin.i18n?.translations?.en?.[field] || fallback;
        const zh = plugin.i18n?.translations?.zh?.[field] || en;
        return `data-plugin-en="${escapeHtml(en)}" data-plugin-zh="${escapeHtml(zh)}">${escapeHtml(en)}`;
      };
      const url = escapeHtml(repository.href.replace(/\/$/, ""));
      return `<article class="store-card" data-plugin-id="${plugin.id}" data-plugin-category="${category}">
      <span class="store-category" data-store-category-label="${category}">${escapeHtml(category)}</span>
      <h3 ${localized("display_name", plugin.display_name)}</h3>
      <p ${localized("description", plugin.description ?? "")}</p>
      <code>${plugin.id}</code>
      <div class="store-card-actions"><a href="${url}" data-i18n="store.source">Source ↗</a><a href="${url}/releases" data-i18n="store.releases">Releases ↗</a></div>
    </article>`;
    })
    .join("\n");
}
