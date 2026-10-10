export type OnboardingResourceState = "development" | "verified" | "bundled" | "failed";

export type OnboardingResourceStatus = {
  frontend: OnboardingResourceState;
  runtime: OnboardingResourceState;
};

export function onboardingResourcesReady(status: OnboardingResourceStatus | null): boolean {
  return status !== null && status.frontend !== "failed" && status.runtime !== "failed";
}
