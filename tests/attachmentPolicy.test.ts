// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  attachmentNameSupported,
  selectableAttachmentExtensions,
} from "../src/lib/attachmentPolicy";

describe("attachment capability policy", () => {
  test("keeps document attachments available when image input is disabled", () => {
    expect(attachmentNameSupported("notes.md", false)).toBe(true);
    expect(attachmentNameSupported("photo.png", false)).toBe(false);
    expect(selectableAttachmentExtensions(false)).not.toContain("png");
    expect(selectableAttachmentExtensions(false)).toContain("md");
  });

  test("enables supported raster images without widening other file types", () => {
    expect(attachmentNameSupported("photo.WEBP", true)).toBe(true);
    expect(attachmentNameSupported("archive.zip", true)).toBe(false);
    expect(selectableAttachmentExtensions(true)).toContain("jpeg");
  });

  test("keeps the attachment composer preview image-enabled", async () => {
    const source = await readFile(
      new URL("../src/lib/components/StandaloneDevPreview.svelte", import.meta.url),
      "utf8",
    );
    const attachmentPreview = source.slice(
      source.indexOf('class="attachment-composer-preview-stage"'),
    );

    expect(attachmentPreview).toMatch(/<MessageInput[\s\S]*?allowImageAttachments/);
  });
});
