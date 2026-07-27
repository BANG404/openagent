// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { getFaviconSources } from "../src/lib/streamdown/urlFavicon";

describe("getFaviconSources", () => {
  test("prefers the website favicon before the remote fallback", () => {
    expect(getFaviconSources("https://www.example.com/docs/page")).toEqual([
      "https://www.example.com/favicon.ico",
      "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fwww.example.com&sz=32",
    ]);
  });

  test("supports HTTP websites with non-default ports", () => {
    expect(getFaviconSources("http://localhost:14221/chat")[0]).toBe(
      "http://localhost:14221/favicon.ico",
    );
  });

  test("does not request icons for invalid or non-web URIs", () => {
    expect(getFaviconSources("not a uri")).toEqual([]);
    expect(getFaviconSources("file:///tmp/report.html")).toEqual([]);
    expect(getFaviconSources("mailto:agent@example.com")).toEqual([]);
  });
});
