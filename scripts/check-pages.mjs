import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

/** @param {string} directory @returns {Promise<string[]>} */
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return htmlFiles(path);
      return entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return files.flat();
}

/** Verify the deployable artifact, including links across both site generators.
 * @param {string} output
 */
export async function checkPages(output) {
  const root = resolve(output);
  const origin = new URL("https://bang404.github.io/openagent/");
  const files = await htmlFiles(root);
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const page = new URL(
      relative(root, file)
        .replaceAll("\\", "/")
        .replace(/index\.html$/, ""),
      origin,
    );
    // A generated 404 page has virtual canonical/alternate routes. Check
    // navigable links and resources, excluding that error-page metadata.
    const links = file.endsWith("404.html")
      ? html.replace(/<link\b[^>]*rel="(?:canonical|alternate)"[^>]*>/g, "")
      : html;
    for (const [, raw] of links.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
      const url = new URL(raw.replaceAll("&amp;", "&"), page);
      if (url.origin !== origin.origin) continue;
      if (!url.pathname.startsWith(origin.pathname)) {
        throw new Error(`Link escapes the GitHub Pages base: ${raw} in ${relative(root, file)}`);
      }
      let target = join(root, decodeURIComponent(url.pathname.slice(origin.pathname.length)));
      try {
        if ((await stat(target)).isDirectory()) target = join(target, "index.html");
        await stat(target);
      } catch {
        throw new Error(`Broken Pages link: ${raw} in ${relative(root, file)}`);
      }
    }
  }
  for (const forbidden of ["package.json", "bun.lock", "src", "node_modules", ".astro"]) {
    const entries = await readdir(join(root, "docs"));
    if (entries.includes(forbidden)) throw new Error(`Documentation source leaked: ${forbidden}`);
  }
  console.log(`Pages artifact verified: ${files.length} HTML pages and their local links.`);
}
