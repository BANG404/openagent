import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPages } from "./check-pages.mjs";
import { renderPluginStore } from "./pages-plugin-store.mjs";

/** @type {string[]} */
const fixtures = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function siteFixture() {
  const root = mkdtempSync(join(tmpdir(), "openagent-pages-check-"));
  fixtures.push(root);
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "index.html"), '<a href="./docs/">Tutorials</a>');
  writeFileSync(join(root, "docs", "index.html"), '<a href="/openagent/">Home</a>');
  return root;
}

test("combined Pages artifact resolves project-base and relative links", async () => {
  const root = siteFixture();
  await checkPages(root);
});

test("a missing generated documentation asset fails qualification", async () => {
  const root = siteFixture();
  writeFileSync(
    join(root, "docs", "index.html"),
    '<script src="/openagent/docs/_astro/missing.js"></script>',
  );
  await expect(checkPages(root)).rejects.toThrow("Broken Pages link");
});

test("links outside the GitHub project base fail qualification", async () => {
  const root = siteFixture();
  writeFileSync(join(root, "index.html"), '<a href="/docs/">Wrong base</a>');
  await expect(checkPages(root)).rejects.toThrow("Link escapes the GitHub Pages base");
});

test("documentation package sources cannot be published", async () => {
  const root = siteFixture();
  writeFileSync(join(root, "docs", "package.json"), "{}");
  await expect(checkPages(root)).rejects.toThrow("Documentation source leaked");
});

const plugin = {
  id: "example",
  display_name: 'Example <plugin> "name"',
  description: "Tools & workflows",
  repository: "https://github.com/Example/plugin",
  category: "development",
  discovery_category: "development",
  i18n: { translations: { zh: { display_name: "示例插件", description: "开发工具" } } },
};

test("store publishes escaped bilingual discovery and repository releases without invented versions", () => {
  const html = renderPluginStore({ schema_version: 1, plugins: [plugin] });
  expect(html).toContain("Example &lt;plugin&gt; &quot;name&quot;");
  expect(html).toContain('data-plugin-zh="示例插件"');
  expect(html).toContain('data-plugin-zh="开发工具"');
  expect(html).toContain('href="https://github.com/Example/plugin/releases"');
  expect(html).toContain('data-plugin-category="development"');
  expect(html).not.toContain("undefined");
});

test("store uses English when a translation is missing and keeps uncategorized entries", () => {
  const html = renderPluginStore({
    schema_version: 1,
    plugins: [{ ...plugin, discovery_category: undefined, i18n: undefined }],
  });
  expect(html).toContain('data-plugin-zh="Tools &amp; workflows"');
  expect(html).toContain('data-plugin-category="uncategorized"');
});

test("store discovery separates channel access and agent collaboration despite their shared manifest category", () => {
  const html = renderPluginStore({
    schema_version: 1,
    plugins: [
      { ...plugin, id: "channel", category: "communication", discovery_category: "channels" },
      { ...plugin, id: "agents", category: "communication", discovery_category: "collaboration" },
    ],
  });
  expect(html).toContain('data-plugin-category="channels"');
  expect(html).toContain('data-plugin-category="collaboration"');
  expect(html).not.toContain('data-plugin-category="communication"');
  for (const discovery_category of ["communication", "unknown", "uncategorized", "<script>"]) {
    expect(() =>
      renderPluginStore({ schema_version: 1, plugins: [{ ...plugin, discovery_category }] }),
    ).toThrow("discovery category");
  }
});

test("store rejects unsupported schemas, duplicate identities, and unsafe repository links", () => {
  expect(() => renderPluginStore({ schema_version: 2, plugins: [] })).toThrow("schema");
  expect(() => renderPluginStore({ schema_version: 1, plugins: [plugin, plugin] })).toThrow(
    "duplicate",
  );
  for (const repository of [
    "javascript:alert(1)",
    "https://example.com/plugin",
    "https://user:secret@github.com/Example/plugin",
    "https://github.com/Example/plugin?token=secret",
  ]) {
    expect(() =>
      renderPluginStore({ schema_version: 1, plugins: [{ ...plugin, repository }] }),
    ).toThrow("repository");
  }
});
