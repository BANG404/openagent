// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { openBrowserUrl, openSurfaceUrl } from "../src/lib/openagent/externalUrl";

describe("external URL surface capabilities", () => {
  test("opens browser-backed links in an isolated tab", () => {
    const popup = { opener: "parent" };
    const calls: unknown[][] = [];

    openBrowserUrl("https://example.com/docs", (...args) => {
      calls.push(args);
      return popup;
    });

    expect(calls).toEqual([["https://example.com/docs", "_blank", "noopener,noreferrer"]]);
    expect(popup.opener).toBeNull();
  });

  test("accepts a null handle from browsers that isolate the new tab", () => {
    expect(() => openBrowserUrl("https://example.com", () => null)).not.toThrow();
  });

  test("uses the native opener in Tauri without a WebView fallback", async () => {
    let browserOpened = false;

    await expect(
      openSurfaceUrl(
        "https://example.com",
        true,
        async () => {
          throw new Error("native opener failed");
        },
        () => {
          browserOpened = true;
          return { opener: null };
        },
      ),
    ).rejects.toThrow("native opener failed");
    expect(browserOpened).toBe(false);
  });

  test("uses the browser opener outside Tauri", async () => {
    let nativeOpened = false;
    const popup = { opener: "parent" };

    await openSurfaceUrl(
      "https://example.com",
      false,
      async () => {
        nativeOpened = true;
      },
      () => popup,
    );

    expect(nativeOpened).toBe(false);
    expect(popup.opener).toBeNull();
  });
});
