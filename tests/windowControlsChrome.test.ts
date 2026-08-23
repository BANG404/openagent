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

  test("stay flush in the title-free onboarding chrome", async () => {
    const source = await readFile(onboardingFlowUrl, "utf8");

    expect(source).not.toContain('"Getting started"');
    expect(source).not.toContain('"入门设置"');
    expect(source).toMatch(/\.onboarding-header\s*{[^}]*justify-content: flex-end;/s);
    expect(source).toMatch(/\.onboarding-header\s*{[^}]*height: 40px;/s);
    expect(source).toMatch(/\.onboarding-header\s*{[^}]*padding: 0;/s);
    expect(source).toMatch(/\.onboarding-nav\s*{[^}]*background: transparent;/s);
    expect(source).toMatch(/button\s*{[^}]*border: 0;/s);
  });
});
