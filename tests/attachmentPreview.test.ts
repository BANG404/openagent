// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  anchoredAttachmentPreviewScroll,
  attachmentPreviewScaleFromWheel,
  isAttachmentPreviewSupported,
} from "../src/lib/attachmentPreview";

describe("attachment preview policy", () => {
  test("allows only explicitly previewable file extensions", () => {
    for (const name of ["diagram.SVG", "report.pdf", "notes.md", "data.json", "photo.webp"]) {
      expect(isAttachmentPreviewSupported(name)).toBe(true);
    }

    for (const name of ["archive.zip", "installer.exe", "README", "notes.md.exe", "trailing.md "]) {
      expect(isAttachmentPreviewSupported(name)).toBe(false);
    }
  });

  test("clamps image wheel zoom to the supported range", () => {
    expect(attachmentPreviewScaleFromWheel(1, -100)).toBeGreaterThan(1);
    expect(attachmentPreviewScaleFromWheel(1, 100)).toBeLessThan(1);
    expect(attachmentPreviewScaleFromWheel(3, -10_000)).toBe(3);
    expect(attachmentPreviewScaleFromWheel(0.5, 10_000)).toBe(0.5);
  });

  test("keeps image content beneath the pointer anchored while zooming", () => {
    expect(anchoredAttachmentPreviewScroll(200, 100, 1, 1.5)).toBe(350);
    expect(anchoredAttachmentPreviewScroll(0, 250, 1, 0.5)).toBe(0);
  });
});
