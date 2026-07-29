export const ONBOARDING_OPEN_EVENT = "openagent-onboarding-open";

const STORAGE_KEY = "openagent.onboarding.completed.v1";

export function hasCompletedOnboarding(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function markOnboardingCompleted(): void {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "true");
}
