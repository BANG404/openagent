// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const bookReaderUrl = new URL("../src/lib/components/AgentBookReader.svelte", import.meta.url);
const mermaidUrl = new URL("../src/lib/streamdown/Mermaid.svelte", import.meta.url);
const fullscreenSurfaceUrl = new URL(
  "../src/lib/components/FullscreenSurface.svelte",
  import.meta.url,
);

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

  test("keeps an in-window fullscreen surface draggable through its own chrome", async () => {
    const source = await readFile(fullscreenSurfaceUrl, "utf8");

    expect(source).toMatch(
      /class="fullscreen-surface-chrome"\s+data-tauri-drag-region=\{platform === "macos" \? "true" : undefined\}/,
    );
    expect(source).toMatch(
      /class="fullscreen-surface-drag-region"\s+data-tauri-drag-region=\{platform === "macos" \? "true" : undefined\}/,
    );
    expect(source).toMatch(
      /\.fullscreen-surface\[data-window-platform="windows"\] \.fullscreen-surface-chrome\)\s*\{[^}]*-webkit-app-region: drag;/s,
    );
    expect(source).toMatch(
      /\.fullscreen-surface\[data-window-platform="windows"\] \.fullscreen-surface-close\)\s*\{[^}]*-webkit-app-region: no-drag;/s,
    );
    expect(source).toMatch(/\.fullscreen-surface-mac-controls\)\s*\{[^}]*height: 27px;/s);
    expect(source.match(/<WindowControls /g)).toHaveLength(1);
  });

  test("leaves Windows without a window-management group beside the surface close", async () => {
    const source = await readFile(fullscreenSurfaceUrl, "utf8");

    expect(source).not.toMatch(/\{#if platform === "windows"\}/);
    expect(source).toMatch(
      /\{#if platform === "macos"\}[\s\S]*?<WindowControls [\s\S]*?\{\/if\}[\s\S]*?fullscreen-surface-close/,
    );
  });
});
