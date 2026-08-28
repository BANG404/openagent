// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import { previewParameterPrefix, resolveStandaloneDevPreview } from "../src/lib/devPreview";

describe("standalone development previews", () => {
  test("resolves the approval queue preview only during development", () => {
    const query = new URLSearchParams("approval-queue-preview");
    expect(resolveStandaloneDevPreview(query, true)).toBe("approval-queue");
    expect(resolveStandaloneDevPreview(query, false)).toBeNull();
  });

  test("selects one explicit preview only in development", () => {
    const query = new URLSearchParams("checkpoint-flow-preview&pause-control-preview");
    expect(resolveStandaloneDevPreview(query, true)).toBe("checkpoint-flow");
    expect(resolveStandaloneDevPreview(query, false)).toBeNull();
  });

  test("keeps theme and locale parameter prefixes aligned with preview URLs", () => {
    expect(previewParameterPrefix("attachment-composer")).toBe("attachment-composer-preview");
    expect(previewParameterPrefix("book-mode")).toBe("book-mode-preview");
    expect(resolveStandaloneDevPreview(new URLSearchParams("runtime-notice-preview"), true)).toBe(
      "runtime-notice",
    );
  });

  test("exposes the streaming transcript preview", () => {
    expect(
      resolveStandaloneDevPreview(new URLSearchParams("streaming-transcript-preview"), true),
    ).toBe("streaming-transcript");
    expect(previewParameterPrefix("streaming-transcript")).toBe("streaming-transcript-preview");
  });

  test("exposes the development cache-usage footer preview", () => {
    expect(resolveStandaloneDevPreview(new URLSearchParams("cache-usage-preview"), true)).toBe(
      "cache-usage",
    );
    expect(previewParameterPrefix("cache-usage")).toBe("cache-usage-preview");
  });

  test("exposes the bounded tool diff preview", () => {
    expect(resolveStandaloneDevPreview(new URLSearchParams("tool-diff-preview"), true)).toBe(
      "tool-diff",
    );
    expect(previewParameterPrefix("tool-diff")).toBe("tool-diff-preview");
  });

  test("exposes the tool-result status preview", () => {
    expect(resolveStandaloneDevPreview(new URLSearchParams("tool-status-preview"), true)).toBe(
      "tool-status",
    );
    expect(previewParameterPrefix("tool-status")).toBe("tool-status-preview");
  });

  test("exposes the Mermaid finalization preview", () => {
    expect(
      resolveStandaloneDevPreview(new URLSearchParams("mermaid-finalization-preview"), true),
    ).toBe("mermaid-finalization");
    expect(previewParameterPrefix("mermaid-finalization")).toBe("mermaid-finalization-preview");
  });

  test("exposes the follow-up suggestions preview", () => {
    expect(
      resolveStandaloneDevPreview(new URLSearchParams("follow-up-suggestions-preview"), true),
    ).toBe("follow-up-suggestions");
    expect(previewParameterPrefix("follow-up-suggestions")).toBe("follow-up-suggestions-preview");
  });

  test("exposes the shared input surfaces preview", () => {
    expect(resolveStandaloneDevPreview(new URLSearchParams("input-surfaces-preview"), true)).toBe(
      "input-surfaces",
    );
    expect(previewParameterPrefix("input-surfaces")).toBe("input-surfaces-preview");
  });

  test("exposes the image source preview", () => {
    expect(resolveStandaloneDevPreview(new URLSearchParams("media-sources-preview"), true)).toBe(
      "media-sources",
    );
    expect(previewParameterPrefix("media-sources")).toBe("media-sources-preview");
  });

  test("exposes the manual compaction status preview", () => {
    expect(
      resolveStandaloneDevPreview(new URLSearchParams("compaction-status-preview"), true),
    ).toBe("compaction-status");
    expect(previewParameterPrefix("compaction-status")).toBe("compaction-status-preview");
  });

  test("keeps the MCP settings tool-control preview wired to its fixture", async () => {
    const [route, settings] = await Promise.all([
      Bun.file(new URL("../src/routes/+page.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/components/SettingsView.svelte", import.meta.url)).text(),
    ]);

    expect(route).toContain('devQuery?.has("mcp-settings-preview")');
    expect(route).toContain('disabled_tools: ["delete_design_asset"]');
    expect(settings).toContain(
      'new URLSearchParams(window.location.search).has("mcp-settings-preview")',
    );
    expect(settings).toContain("inspect_design_asset_with_a_very_long_tool_name");
  });
});
