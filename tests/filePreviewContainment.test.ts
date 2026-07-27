// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  clearContainingFilePreviewOpen,
  FILE_PREVIEW_OPEN_RECORD_ATTRIBUTE,
  setContainingFilePreviewOpen,
} from "../src/lib/streamdown/filePreviewContainment";

function elementWithRecord(record: {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
} | null): Element {
  return {
    closest: () => record,
  } as unknown as Element;
}

describe("File preview containment", () => {
  test("marks and clears the containing message record", () => {
    const attributes = new Map<string, string>();
    const record = {
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
      removeAttribute(name: string) {
        attributes.delete(name);
      },
    };

    const previewRecord = setContainingFilePreviewOpen(elementWithRecord(record));
    expect(previewRecord).toBe(record);
    expect(attributes.get(FILE_PREVIEW_OPEN_RECORD_ATTRIBUTE)).toBe("true");

    clearContainingFilePreviewOpen(previewRecord);
    expect(attributes.has(FILE_PREVIEW_OPEN_RECORD_ATTRIBUTE)).toBe(false);
  });

  test("does nothing outside a message record", () => {
    expect(setContainingFilePreviewOpen(elementWithRecord(null))).toBeNull();
    expect(() => clearContainingFilePreviewOpen(null)).not.toThrow();
  });
});
