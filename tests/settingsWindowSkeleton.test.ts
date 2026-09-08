// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { settingsWindowSkeletonSpec } from "../src/lib/settingsWindowSkeleton";

describe("settings window skeleton layout", () => {
  test("matches collection-backed settings surfaces", () => {
    expect(settingsWindowSkeletonSpec("models", "providers")).toMatchObject({
      section: "providers",
      layout: "collection",
      showNavigation: true,
    });
    expect(settingsWindowSkeletonSpec("integrations", "channels")).toMatchObject({
      section: "channels",
      layout: "collection",
      showNavigation: true,
    });
    expect(settingsWindowSkeletonSpec("integrations", "extensions")).toMatchObject({
      section: "extensions",
      layout: "collection",
      showNavigation: true,
    });
  });

  test("matches content and about surfaces", () => {
    expect(settingsWindowSkeletonSpec("general", "general")).toMatchObject({
      section: "general",
      layout: "content",
      showNavigation: false,
    });
    expect(settingsWindowSkeletonSpec("agent", "execution")).toMatchObject({
      section: "execution",
      layout: "content",
      showNavigation: true,
    });
    expect(settingsWindowSkeletonSpec("about", "about")).toMatchObject({
      section: "about",
      layout: "about",
      showNavigation: false,
    });
  });

  test("falls back to the window's actual default section", () => {
    expect(settingsWindowSkeletonSpec("models", "unknown")).toMatchObject({
      section: "providers",
      layout: "collection",
    });
  });
});
