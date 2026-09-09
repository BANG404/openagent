// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { normalizeBrowserAddress } from "../src/lib/browserNavigation";

describe("browser address normalization", () => {
  test("adds a secure scheme to ordinary hostnames", () => {
    expect(normalizeBrowserAddress("example.com/docs?q=1")).toBe("https://example.com/docs?q=1");
  });

  test("uses HTTP for local development addresses", () => {
    expect(normalizeBrowserAddress("localhost:5173/demo")).toBe("http://localhost:5173/demo");
    expect(normalizeBrowserAddress("127.0.0.1:3000")).toBe("http://127.0.0.1:3000/");
  });

  test("rejects empty, malformed, and non-web addresses", () => {
    expect(normalizeBrowserAddress(" ")).toBeNull();
    expect(normalizeBrowserAddress("file:///tmp/demo.html")).toBeNull();
    expect(normalizeBrowserAddress("https://")).toBeNull();
  });
});
