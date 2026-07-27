// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  clearContainingMessageExpanded,
  MERMAID_EXPANDED_ATTRIBUTE,
  MERMAID_EXPANDED_RECORD_ATTRIBUTE,
  portalContainingMermaid,
  setContainingMessageExpanded,
} from "../src/lib/streamdown/mermaidFullscreen";

function elementWithRecord(record: {
  toggleAttribute(name: string, force?: boolean): boolean;
  removeAttribute(name: string): void;
} | null): Element {
  return {
    closest: () => record,
  } as unknown as Element;
}

describe("Mermaid fullscreen containment", () => {
  test("marks and clears the containing message record", () => {
    const attributes = new Set<string>();
    const record = {
      toggleAttribute(name: string, force?: boolean) {
        if (force) attributes.add(name);
        else attributes.delete(name);
        return attributes.has(name);
      },
      removeAttribute(name: string) {
        attributes.delete(name);
      },
    };

    const expandedRecord = setContainingMessageExpanded(elementWithRecord(record), true);
    expect(expandedRecord).toBe(record);
    expect(attributes.has(MERMAID_EXPANDED_RECORD_ATTRIBUTE)).toBe(true);

    clearContainingMessageExpanded(expandedRecord);
    expect(attributes.has(MERMAID_EXPANDED_RECORD_ATTRIBUTE)).toBe(false);
  });

  test("does nothing outside a message record", () => {
    expect(setContainingMessageExpanded(elementWithRecord(null), true)).toBeNull();
    expect(() => clearContainingMessageExpanded(null)).not.toThrow();
  });

  test("portals the Mermaid host and restores its exact position", () => {
    const attributes = new Map<string, string>();
    const before = {};
    const after = {};
    const originalChildren: unknown[] = [before];
    const originalParent = {
      appendChild(child: unknown) {
        originalChildren.push(child);
      },
      insertBefore(child: unknown, sibling: unknown) {
        originalChildren.splice(originalChildren.indexOf(sibling), 0, child);
      },
    };
    const portalChildren: unknown[] = [];
    const portalRoot = {
      appendChild(child: unknown) {
        const index = originalChildren.indexOf(child);
        if (index >= 0) originalChildren.splice(index, 1);
        portalChildren.push(child);
      },
    };
    const host = {
      parentNode: originalParent,
      nextSibling: after,
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
    };
    originalChildren.push(host, after);
    Object.defineProperty(after, "parentNode", { value: originalParent });
    const target = {
      closest: () => host,
    };

    const portal = portalContainingMermaid(
      target as unknown as Element,
      portalRoot as unknown as HTMLElement,
    );

    expect(portalChildren).toEqual([host]);
    expect(attributes.get(MERMAID_EXPANDED_ATTRIBUTE)).toBe("true");

    portal?.restore();
    expect(originalChildren).toEqual([before, host, after]);
    expect(attributes.get(MERMAID_EXPANDED_ATTRIBUTE)).toBe("false");
  });
});
