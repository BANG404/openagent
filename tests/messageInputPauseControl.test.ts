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
    const [desktop, remote] = await Promise.all([
      Bun.file(new URL("../src/routes/+page.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/routes/remote/+page.svelte", import.meta.url)).text(),
    ]);

    expect(desktop).toMatch(/if \(paused\) await setStreamPaused\(activeConvId, false\);/);
    expect(desktop).toContain('devQuery?.has("pause-control-preview") === true');
    expect(remote).toMatch(/if \(streamPaused\) await setStreamPaused\(false\);/);
  });
});
