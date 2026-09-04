// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
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
      Bun.file(new URL("../src/routes/+page.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/routes/remote/+page.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/devPreview.ts", import.meta.url)).text(),
    ]);

    expect(desktop).toMatch(/if \(paused\) await setStreamPaused\(activeConvId, false\);/);
    expect(previews).toContain('["pause-control-preview", "pause-control"]');
    expect(remote).toMatch(/if \(streamPaused\) await setStreamPaused\(false\);/);
  });

  test("measures the textarea from a stable single-line CSS minimum", async () => {
    const source = await Bun.file(
      new URL("../src/lib/components/MessageInput.svelte", import.meta.url),
    ).text();

    expect(source).toContain(
      "const minHeight = Number.parseFloat(getComputedStyle(element).minHeight)",
    );
    expect(source).toContain("element.style.height = `${minHeight}px`;");
    expect(source).toContain("if (!element.value) return;");
    expect(source).toContain("Math.max(element.scrollHeight, minHeight)");
    expect(source).toMatch(/<textarea\s+class="input input-editor"\s+rows="1"/);
    expect(source).not.toContain('element.style.height = "auto";');
    expect(source).toMatch(
      /const draftValue = value;\s+void tick\(\)\.then\(\(\) => \{\s+if \(textareaEl\?\.value === draftValue\) resizeTextarea\(\);/,
    );
    expect(source).toMatch(/onMount\(\(\) => \{\s+resizeTextarea\(\);\s+focusInput\(\);/);
  });
});
