import { isTauri } from "@tauri-apps/api/core";
import { confirmFrontendActivationWithRetry } from "$lib/frontendActivation";
import { invoke } from "$lib/openagent/tauriClient";
import { reportComponentUpdateEvent } from "$lib/frontendDiagnostics";

export async function init(): Promise<void> {
  if (!isTauri()) return;
  const version = new URLSearchParams(window.location.search).get("frontend-version");
  if (!version) return;

  await reportComponentUpdateEvent("frontend", "confirmation_started", {
    candidateVersion: version,
  });
  try {
    await confirmFrontendActivationWithRetry(version, (candidate) =>
      invoke("confirm_frontend_activation", { version: candidate }),
    );
    await reportComponentUpdateEvent("frontend", "confirmation_finished", {
      candidateVersion: version,
    });
  } catch (error) {
    await reportComponentUpdateEvent(
      "frontend",
      "confirmation_failed",
      { candidateVersion: version },
      error,
    );
    throw error;
  }
}
