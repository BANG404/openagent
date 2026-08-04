// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";

const srcRoot = new URL("../src/", import.meta.url);
const nativeTooltipPatterns = [
  /<(?!iframe\b)([a-z][\w:-]*)\b[^>]*\btitle\s*=/g,
  /<(?!iframe\b)([a-z][\w:-]*)\b[^>]*\s\{title\}(?=\s|\/?>)[^>]*>/g,
];

async function svelteFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      return entry.isDirectory() ? svelteFiles(url) : [url];
    }),
  );
  return files.flat().filter((file) => extname(file.pathname) === ".svelte");
}

describe("tooltip usage", () => {
  test("uses the shared tooltip instead of native title hints", async () => {
    const violations: string[] = [];

    for (const file of await svelteFiles(srcRoot)) {
      const source = await readFile(file, "utf8");
      for (const pattern of nativeTooltipPatterns) {
        for (const match of source.matchAll(pattern)) {
          const line = source.slice(0, match.index).split("\n").length;
          violations.push(`${relative(srcRoot.pathname, file.pathname)}:${line} <${match[1]}>`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("keeps conversation titles free of hover tooltips", async () => {
    const source = await readFile(
      new URL("lib/components/ConversationList.svelte", srcRoot),
      "utf8",
    );
    const titleSnippet = source.match(
      /\{#snippet conversationTitle\(title: string\)\}([\s\S]*?)\{\/snippet\}/,
    );

    expect(titleSnippet?.[1]).toBeDefined();
    expect(titleSnippet?.[1]).not.toContain("<Tooltip");
  });

  test("uses one tooltip surface for the user-message index", async () => {
    const source = await readFile(new URL("lib/components/MessageList.svelte", srcRoot), "utf8");
    const indexSnippet = source.match(/<nav class="user-message-index"[\s\S]*?<\/nav>/)?.[0];

    expect(indexSnippet).toBeDefined();
    expect(indexSnippet?.match(/<Tooltip\b/g)).toHaveLength(1);
    expect(indexSnippet).not.toContain("index-preview");
  });
});
