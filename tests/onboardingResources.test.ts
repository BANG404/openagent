import { expect, test } from "bun:test";
import { onboardingResourcesReady } from "../src/lib/onboardingResources";

test("resource checks block unknown and failed results", () => {
  expect(onboardingResourcesReady(null)).toBe(false);
  expect(onboardingResourcesReady({ frontend: "failed", runtime: "verified" })).toBe(false);
  expect(onboardingResourcesReady({ frontend: "verified", runtime: "failed" })).toBe(false);
  expect(onboardingResourcesReady({ frontend: "development", runtime: "development" })).toBe(true);
  expect(onboardingResourcesReady({ frontend: "verified", runtime: "verified" })).toBe(true);
});
