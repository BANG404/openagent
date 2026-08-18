export const ONBOARDING_COMPLETE_EVENT = "openagent-onboarding-complete";

const LEGACY_STORAGE_KEY = "openagent.onboarding.completed.v1";

export function hasLegacyOnboardingCompletion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LEGACY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function clearLegacyOnboardingCompletion(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // A disabled WebView storage backend should not block durable config state.
  }
}
