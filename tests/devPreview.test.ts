// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import { previewParameterPrefix, resolveStandaloneDevPreview } from "../src/lib/devPreview";

describe("standalone development previews", () => {
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

  test("exposes the manual compaction status preview", () => {
    expect(
      resolveStandaloneDevPreview(new URLSearchParams("compaction-status-preview"), true),
    ).toBe("compaction-status");
    expect(previewParameterPrefix("compaction-status")).toBe("compaction-status-preview");
  });
});
