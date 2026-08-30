// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/routes/+page.svelte", import.meta.url);
const onboardingUrl = new URL("../src/lib/onboarding.ts", import.meta.url);
const onboardingFlowUrl = new URL("../src/lib/components/OnboardingFlow.svelte", import.meta.url);

describe("onboarding completion", () => {
  test("requires durable configuration and a ready embedding resource", async () => {
    const [route, onboarding, onboardingFlow] = await Promise.all([
      readFile(routeUrl, "utf8"),
      readFile(onboardingUrl, "utf8"),
      readFile(onboardingFlowUrl, "utf8"),
    ]);

    expect(route).toContain(
      "requiresOnboarding = !config.onboarding_completed || !embeddingResourceReady;",
    );
    expect(route).toContain('"get_embedding_resource_status"');
    expect(route).not.toContain("hasLegacyOnboardingCompletion");
    expect(route).not.toContain("clearLegacyOnboardingCompletion");
    expect(onboarding).not.toContain("localStorage");
    expect(onboardingFlow).toContain("workspace: workspacePath");
  });
});
