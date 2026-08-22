// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/routes/+page.svelte", import.meta.url);
const onboardingUrl = new URL("../src/lib/onboarding.ts", import.meta.url);

describe("onboarding completion", () => {
  test("uses durable configuration as the only completion source", async () => {
    const [route, onboarding] = await Promise.all([
      readFile(routeUrl, "utf8"),
      readFile(onboardingUrl, "utf8"),
    ]);

    expect(route).toContain("requiresOnboarding = !config.onboarding_completed;");
    expect(route).not.toContain("hasLegacyOnboardingCompletion");
    expect(route).not.toContain("clearLegacyOnboardingCompletion");
    expect(onboarding).not.toContain("localStorage");
  });
});
