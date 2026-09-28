import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const COMPOSER = "../src/lib/components/MessageInput.svelte";
const COMPOSER_SKELETON = "../src/lib/components/LoadingSkeleton.svelte";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("composer loading skeleton", () => {
  test("shares the composer geometry tokens with the mounted composer", async () => {
    const [appCss, composer, skeleton] = await Promise.all([
      read("../src/app.css"),
      read(COMPOSER),
      read(COMPOSER_SKELETON),
    ]);

    for (const token of [
      "--composer-input-padding",
      "--composer-input-min-height",
      "--composer-input-narrow-min-height",
      "--composer-toolbar-min-height",
      "--composer-control-size",
      "--composer-control-radius",
      "--composer-send-inset",
    ]) {
      expect(appCss).toContain(`${token}:`);
    }

    expect(composer).toMatch(
      /\.input \{[^}]*padding: var\(--composer-input-padding\);[^}]*min-height: var\(--composer-input-min-height\);/s,
    );
    expect(composer).toMatch(
      /\.composer-toolbar \{[^}]*min-height: var\(--composer-toolbar-min-height\);/s,
    );
    expect(composer).toMatch(
      /\.send-btn \{[^}]*right: var\(--composer-send-inset\);[^}]*bottom: var\(--composer-send-inset\);[^}]*width: var\(--composer-control-size\);[^}]*height: var\(--composer-control-size\);[^}]*border-radius: var\(--composer-control-radius\);/s,
    );
    expect(composer).toMatch(
      /@container \(max-width: 280px\) \{\s*\.composer \.input \{\s*min-height: var\(--composer-input-narrow-min-height\) !important;/,
    );

    expect(skeleton).toMatch(
      /\.composer-input-area \{[^}]*min-height: var\(--composer-input-min-height\);[^}]*padding: var\(--composer-input-padding\);/s,
    );
    expect(skeleton).toMatch(
      /\.composer-toolbar \{[^}]*min-height: var\(--composer-toolbar-min-height\);[^}]*padding: 0 48px 6px 9px;/s,
    );
    expect(skeleton).toMatch(
      /\.composer-action,\s*\.composer-send \{[^}]*width: var\(--composer-control-size\);[^}]*height: var\(--composer-control-size\);/s,
    );
    expect(skeleton).toMatch(
      /@container \(max-width: 280px\) \{\s*\.composer-input-area \{\s*min-height: var\(--composer-input-narrow-min-height\);/,
    );
    expect(skeleton).toMatch(
      /\.composer-send \{[^}]*position: absolute;[^}]*right: var\(--composer-send-inset\);[^}]*bottom: var\(--composer-send-inset\);[^}]*border-radius: var\(--composer-control-radius\);/s,
    );
  });

  test("keeps the skeleton card on the mounted composer surface", async () => {
    const skeleton = await read(COMPOSER_SKELETON);

    expect(skeleton).toMatch(/\.composer-copy \{[^}]*border: 1px solid var\(--composer-border\);/s);
    expect(skeleton).toMatch(/\.composer-copy \{[^}]*border-radius: var\(--app-radius\);/s);
    expect(skeleton).toMatch(/\.composer-copy \{[^}]*box-shadow: var\(--composer-shadow\);/s);
    expect(skeleton).not.toMatch(/\.composer-copy \{[^}]*min-height:/s);
  });

  test("lets neither host restate the composer skeleton height", async () => {
    const [desktop, remote] = await Promise.all([
      read("../src/lib/components/ConversationSurface.svelte"),
      read("../src/routes/remote/+page.svelte"),
    ]);

    for (const host of [desktop, remote]) {
      expect(host).not.toContain(".composer-copy");
    }
  });
});
