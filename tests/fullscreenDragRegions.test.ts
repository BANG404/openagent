// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const bookReaderUrl = new URL("../src/lib/components/AgentBookReader.svelte", import.meta.url);
const mermaidUrl = new URL("../src/lib/streamdown/Mermaid.svelte", import.meta.url);

describe("fullscreen window drag regions", () => {
  test("keeps an explicit drag target above book content and outside its controls", async () => {
    const source = await readFile(bookReaderUrl, "utf8");

    expect(source).toMatch(
      /class="agent-book-drag-region"\s+data-tauri-drag-region\s+aria-hidden="true"/,
    );
    expect(source).toMatch(
      /class="agent-book-window-edge-drag-region"\s+data-tauri-drag-region\s+aria-hidden="true"/,
    );
    expect(source).toMatch(/\.agent-book-window-edge-drag-region\s*{[^}]*height: 24px;/s);
    expect(source).toContain("inset: 0 42px 0 0;");
    expect(source).toMatch(/\.agent-book-controls\s*{[^}]*z-index: 2;/s);
  });

  test("keeps Mermaid's fullscreen drag target out of embedded pan and zoom", async () => {
    const source = await readFile(mermaidUrl, "utf8");

    expect(source).toMatch(
      /class="mermaid-window-drag-region"\s+data-tauri-drag-region\s+data-panzoom-ignore/,
    );
    expect(source).toMatch(
      /class="mermaid-window-edge-drag-region"\s+data-tauri-drag-region\s+data-panzoom-ignore/,
    );
    expect(source).toContain('[data-streamdown-mermaid][data-expanded="true"]');
    expect(source).toMatch(/\.mermaid-window-edge-drag-region,\s*\.mermaid-window-drag-region/);
    expect(source).toMatch(/\.mermaid-window-edge-drag-region\s*{[^}]*height: 16px;/s);
  });
});
