import { describe, expect, test } from "bun:test";

describe("stream pause control", () => {
  test("maps the empty streaming composer between pause and resume", async () => {
    const source = await Bun.file(
      new URL("../src/lib/components/MessageInput.svelte", import.meta.url),
    ).text();

    expect(source).toContain(
      "hasComposerContent ? sendTitle : isPaused ? resumeTitle : pauseTitle",
    );
    expect(source).toMatch(
      /if \(!isStreaming \|\| hasComposerContent\) \{\s+onSend\(\);\s+\} else if \(isPaused\) \{\s+onResume\(\);\s+\} else \{\s+onPause\(\);/,
    );
  });

  test("resumes a paused stream after queuing a follow-up", async () => {
    const [desktop, remote, previews] = await Promise.all([
      Bun.file(new URL("../src/routes/PageRuntime.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/routes/remote/+page.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/devPreview.ts", import.meta.url)).text(),
    ]);

    expect(desktop).toMatch(/if \(paused\) await setStreamPaused\(activeConvId, false\);/);
    expect(previews).toContain('["pause-control-preview", "pause-control"]');
    expect(remote).toMatch(/if \(streamPaused\) await setStreamPaused\(false\);/);
  });

  test("sizes the contenteditable composer from CSS rather than measured height", async () => {
    const source = await Bun.file(
      new URL("../src/lib/components/MessageInput.svelte", import.meta.url),
    ).text();

    expect(source).toMatch(/<div\s+class="input input-editor composer-md"/);
    expect(source).toContain('contenteditable={disabled ? "false" : "true"}');
    // No JS height measurement survives; the CSS clamp owns the editor size.
    expect(source).not.toContain("resizeTextarea");
    expect(source).not.toContain("scrollHeight");
    expect(source).toMatch(
      /\n {2}\.input \{[^}]*min-height: var\(--composer-input-min-height\);[^}]*max-height: 200px;[^}]*overflow-y: auto;/s,
    );
  });

  test("gates re-projection behind IME composition", async () => {
    const source = await Bun.file(
      new URL("../src/lib/components/MessageInput.svelte", import.meta.url),
    ).text();

    expect(source).toMatch(
      /if \(!editorEl \|\| composing \|\| nextValue === lastProjected\) return;/,
    );
    expect(source).toContain("oncompositionstart={handleCompositionStart}");
    expect(source).toContain("oncompositionend={handleCompositionEnd}");
    expect(source).toMatch(
      /function handleBeforeInput\(event: InputEvent\) \{\s+if \(composing\) return;/,
    );
  });

  test("replaces a selected range on backward deletion and hides the placeholder during IME", async () => {
    const source = await Bun.file(
      new URL("../src/lib/components/MessageInput.svelte", import.meta.url),
    ).text();

    expect(source).toMatch(
      /case "deleteContentBackward":\s+if \(start !== end\) \{\s+replace\(start, end, ""\);/s,
    );
    expect(source).toContain("class:input-editor-empty={value.length === 0 && !composing}");
  });
});
