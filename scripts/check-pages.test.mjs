import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPages } from "./check-pages.mjs";

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
