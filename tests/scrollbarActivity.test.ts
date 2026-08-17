// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const srcUrl = new URL("../src/", import.meta.url);

describe("scrollbar activity", () => {
  test("installs one application-wide idle controller", async () => {
    const layout = await readFile(new URL("routes/+layout.svelte", srcUrl), "utf8");
    const activity = await readFile(new URL("lib/scrollbarActivity.ts", srcUrl), "utf8");

    expect(layout).toContain("installScrollbarActivity");
    expect(activity).toContain('document.addEventListener("scroll", handleScroll, true)');
    expect(activity).toContain('document.addEventListener("pointermove", handlePointerMove');
    expect(activity).toContain('element.setAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE, "true")');
    expect(activity).toContain("element.removeAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE)");
  });

  test("keeps native scrollbar geometry while hiding idle thumbs", async () => {
    const css = await readFile(new URL("app.css", srcUrl), "utf8");
    const messageInput = await readFile(
      new URL("lib/components/MessageInput.svelte", srcUrl),
      "utf8",
    );
    const quickChat = await readFile(new URL("lib/components/QuickChat.svelte", srcUrl), "utf8");
    const scrollArea = await readFile(
      new URL("lib/components/ui/ScrollArea.svelte", srcUrl),
      "utf8",
    );

    expect(css).toContain("scrollbar-color: transparent transparent");
    expect(css).toContain('[data-scrollbar-active="true"]::-webkit-scrollbar-thumb');
    expect(css).toMatch(/::-webkit-scrollbar \{\s*width: 5px;\s*height: 5px;/);
    expect(messageInput).not.toContain("scrollbar-width: none");
    expect(messageInput).not.toMatch(/::-webkit-scrollbar[^{]*\{\s*display: none;/);
    expect(quickChat).not.toContain("scrollbar-width: none");
    expect(quickChat).not.toMatch(/::-webkit-scrollbar[^{]*\{\s*display: none;/);
    expect(scrollArea).toContain('<ScrollArea.Root type="always"');
    expect(scrollArea).toContain('.ui-scroll-area-viewport[data-scrollbar-active="true"]');
  });
});
