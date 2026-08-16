// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { normalizeExternalLinkUrl, openExternalLink } from "../src/lib/streamdown/externalLink";

describe("external Markdown links", () => {
  test("normalizes HTTP and HTTPS links for the platform opener", () => {
    expect(normalizeExternalLinkUrl("https://example.com/news?id=1")).toBe(
      "https://example.com/news?id=1",
    );
    expect(normalizeExternalLinkUrl("http://localhost:14221/docs")).toBe(
      "http://localhost:14221/docs",
    );
  });

  test("blocks relative and non-web links", () => {
    expect(normalizeExternalLinkUrl("/settings")).toBeNull();
    expect(normalizeExternalLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalLinkUrl("file:///tmp/report.html")).toBeNull();
    expect(normalizeExternalLinkUrl("mailto:agent@example.com")).toBeNull();
  });

  test("consumes opener failures", async () => {
    const warnings: Array<[string, unknown]> = [];
    const opened = await openExternalLink(
      "https://example.com",
      async () => {
        throw "opener unavailable";
      },
      (message, error) => warnings.push([message, error]),
    );

    expect(opened).toBe(false);
    expect(warnings).toEqual([["openUrl failed", "opener unavailable"]]);
  });
});
