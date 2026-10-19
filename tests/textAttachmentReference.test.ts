import { describe, expect, test } from "bun:test";
import { attachmentLocator, isLargeTextPaste } from "../src/lib/textAttachmentReference";

describe("large pasted text", () => {
  test("counts Unicode characters and folds only above the threshold", () => {
    expect(isLargeTextPaste("字".repeat(1000))).toBe(false);
    expect(isLargeTextPaste("😀".repeat(1000))).toBe(false);
    expect(isLargeTextPaste("😀".repeat(1001))).toBe(true);
    expect(isLargeTextPaste("x".repeat(1001))).toBe(true);
  });

  test("unwraps only the explicit reference delivery mode", () => {
    expect(attachmentLocator("text-ref:C:\\files\\paste.txt")).toBe("C:\\files\\paste.txt");
    expect(attachmentLocator("text-ref:sha256:abc")).toBe("sha256:abc");
    expect(attachmentLocator("C:\\files\\paste.txt")).toBe("C:\\files\\paste.txt");
  });
});
