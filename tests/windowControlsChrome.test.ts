// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const windowControlsUrl = new URL("../src/lib/components/WindowControls.svelte", import.meta.url);
const onboardingFlowUrl = new URL("../src/lib/components/OnboardingFlow.svelte", import.meta.url);

describe("Windows window controls", () => {
  test("follow the title-bar height and native outer-corner state", async () => {
    const source = await readFile(windowControlsUrl, "utf8");

    expect(source).toContain('class:windows={resolvedPlatform === "windows"}');
    expect(source).toContain("class:maximized={isMaximized}");
    expect(source).toMatch(
      /\.win-controls:not\(\.macos\) :global\(\.tt-trigger\) \{\s*height: 100%;/,
    );
    expect(source).toMatch(
      /\.win-controls\.windows:not\(\.maximized\) \.win-close \{\s*border-top-right-radius: 7px;/,
    );
    expect(source).toMatch(/\.win-close:hover \{\s*background: #e81123;/);
  });

  test("stay flush with the trailing edge of the onboarding window", async () => {
    const source = await readFile(onboardingFlowUrl, "utf8");

    expect(source).toMatch(/\.onboarding-header\s*{[^}]*padding: 0 0 0 16px;/s);
  });
});
