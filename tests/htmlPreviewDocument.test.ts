// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  htmlPreviewDirectoryUrl,
  injectHtmlPreviewBase,
} from "../src/lib/streamdown/htmlPreviewDocument";

describe("HTML preview document base", () => {
  test("injects the asset directory as the first element in an existing head", () => {
    const html = '<!doctype html><html><head><base href="https://wrong.example/"><title>Preview</title></head><body><img src="frames/one.png"></body></html>';
    const result = injectHtmlPreviewBase(html, "http://asset.localhost/%2Fworkspace%2Fsnapshots");

    expect(result).toContain('<head><base href="http://asset.localhost/%2Fworkspace%2Fsnapshots/"><base href="https://wrong.example/">');
  });

  test("creates a head when the source document omits one", () => {
    const result = injectHtmlPreviewBase("<html><body>Preview</body></html>", "asset://localhost/%2Ftmp%2Fpreview/");

    expect(result).toBe('<html><head><base href="asset://localhost/%2Ftmp%2Fpreview/"></head><body>Preview</body></html>');
  });

  test("escapes the generated base attribute and preserves one trailing slash", () => {
    expect(htmlPreviewDirectoryUrl("asset://localhost/root/")).toBe("asset://localhost/root/");
    expect(injectHtmlPreviewBase("Preview", 'asset://localhost/a&b"c')).toBe(
      '<base href="asset://localhost/a&amp;b&quot;c/">Preview',
    );
  });
});
