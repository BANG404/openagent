// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { settingsWindowSkeletonSpec } from "../src/lib/settingsWindowSkeleton";

describe("settings window skeleton layout", () => {
  test("keeps every collection-backed destination distinct", () => {
    expect(settingsWindowSkeletonSpec("models", "providers")).toMatchObject({
      section: "providers",
      layout: "providers",
      showNavigation: true,
    });
    expect(settingsWindowSkeletonSpec("integrations", "channels")).toMatchObject({
      section: "channels",
      layout: "channels",
      showNavigation: true,
    });
    expect(settingsWindowSkeletonSpec("integrations", "extensions")).toMatchObject({
      section: "extensions",
      layout: "extensions",
      showNavigation: true,
    });
  });

  test("keeps content destinations distinct", () => {
    expect(settingsWindowSkeletonSpec("general", "general")).toMatchObject({
      section: "general",
      layout: "general",
      showNavigation: false,
    });
    expect(settingsWindowSkeletonSpec("agent", "execution")).toMatchObject({
      section: "execution",
      layout: "execution",
      showNavigation: true,
    });
    expect(settingsWindowSkeletonSpec("agent", "agents")).toMatchObject({
      layout: "agents",
    });
    expect(settingsWindowSkeletonSpec("automation", "lifecycle")).toMatchObject({
      section: "lifecycle",
      layout: "lifecycle",
      showNavigation: true,
    });
    expect(settingsWindowSkeletonSpec("automation", "schedules")).toMatchObject({
      section: "schedules",
      layout: "schedules",
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
      layout: "providers",
    });
  });
});
