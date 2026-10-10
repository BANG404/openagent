import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const startupUrl = new URL("../src/lib/page/startup.ts", import.meta.url);
const onboardingUrl = new URL("../src/lib/onboarding.ts", import.meta.url);
const onboardingFlowUrl = new URL("../src/lib/components/OnboardingFlow.svelte", import.meta.url);

describe("onboarding completion", () => {
  test("requires durable configuration and a ready embedding resource", async () => {
    const [route, onboarding, onboardingFlow] = await Promise.all([
      readFile(startupUrl, "utf8"),
      readFile(onboardingUrl, "utf8"),
      readFile(onboardingFlowUrl, "utf8"),
    ]);

    expect(route).toContain("embeddingResourceStatusKnown");
    expect(route).not.toContain("!embeddingResourceStatusKnown && !mainWindowWasVisible");
    expect(route).toContain("embeddingResourceStatusKnown && !embeddingResourceReady");
    expect(route).toContain('"get_embedding_resource_status"');
    expect(route).not.toContain("hasLegacyOnboardingCompletion");
    expect(route).not.toContain("clearLegacyOnboardingCompletion");
    expect(onboarding).not.toContain("localStorage");
    expect(onboardingFlow).toContain("workspace: workspacePath");
  });

  test("prepares local resources in Welcome and leaves Ready as a summary", async () => {
    const flow = await readFile(onboardingFlowUrl, "utf8");
    const welcomeEnd = flow.indexOf("{:else if step === 1}");
    const embeddingCard = flow.indexOf('class="application-settings-surface embedding-card"');
    expect(embeddingCard).toBeGreaterThan(0);
    expect(embeddingCard).toBeLessThan(welcomeEnd);
    expect(flow).toContain("let step = $state(0)");
    expect(flow).toContain('embeddingStatus.state !== "ready"');
    expect(flow).toContain("resourceOnly ? copy.steps.slice(0, 1) : copy.steps");
  });

  test("keeps the frameless setup window draggable", async () => {
    const onboardingFlow = await readFile(onboardingFlowUrl, "utf8");

    expect(onboardingFlow).toContain(
      '<div class="onboarding-drag-region" data-tauri-drag-region aria-hidden="true"></div>',
    );
    expect(onboardingFlow).toContain("-webkit-app-region: drag;");
  });
});
