import { isTauri } from "@tauri-apps/api/core";
import { confirmFrontendActivationWithRetry } from "$lib/frontendActivation";
import { invoke } from "$lib/openagent/tauriClient";

export async function init(): Promise<void> {
  if (!isTauri()) return;
  const version = new URLSearchParams(window.location.search).get("frontend-version");
  if (!version) return;

  await confirmFrontendActivationWithRetry(version, (candidate) =>
    invoke("confirm_frontend_activation", { version: candidate }),
  );
}
