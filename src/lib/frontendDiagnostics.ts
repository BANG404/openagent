import { isTauri } from "@tauri-apps/api/core";
import type { FrontendDiagnosticRequest } from "$lib/openagent/contracts";
import { invoke } from "$lib/openagent/tauriClient";

function errorKind(value: unknown): string {
  if (value instanceof Error) return value.name || "Error";
  if (typeof DOMException !== "undefined" && value instanceof DOMException && value.name) {
    return value.name;
  }
  // Errors raised by the Tauri WebView can belong to another JS realm, so
  // instanceof checks are not reliable for them.
  if (value !== null && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return typeof value;
}

const REPORTED_ERROR_TTL_MS = 1000;
const recentlyReported = new Map<string, number>();

function shouldReport(key: string): boolean {
  const now = Date.now();
  const previous = recentlyReported.get(key);
  if (previous !== undefined && now - previous < REPORTED_ERROR_TTL_MS) return false;
  recentlyReported.set(key, now);
  if (recentlyReported.size > 100) {
    for (const [candidate, timestamp] of recentlyReported) {
      if (now - timestamp >= REPORTED_ERROR_TTL_MS) recentlyReported.delete(candidate);
    }
  }
  return true;
}

export type ComponentUpdateDiagnosticStage =
  | "check_started"
  | "check_available"
  | "check_current"
  | "check_failed"
  | "download_started"
  | "download_finished"
  | "download_failed"
  | "install_started"
  | "install_finished"
  | "install_failed"
  | "confirmation_started"
  | "confirmation_finished"
  | "confirmation_failed"
  | "restart_requested";

export async function reportComponentUpdateEvent(
  component: "shell" | "runtime" | "frontend",
  stage: ComponentUpdateDiagnosticStage,
  versions: { currentVersion?: string; candidateVersion?: string } = {},
  error?: unknown,
): Promise<void> {
  if (typeof window === "undefined" || !isTauri()) return;
  await invoke<void>("report_component_update_event", {
    component,
    stage,
    currentVersion: versions.currentVersion,
    candidateVersion: versions.candidateVersion,
    errorKind: error === undefined ? undefined : errorKind(error),
  }).catch(() => {});
}

export function reportFrontendDiagnostic(
  eventName: string,
  component: string,
  error: unknown,
): void {
  if (typeof window === "undefined" || !isTauri()) return;
  const request: FrontendDiagnosticRequest = {
    eventName,
    component,
    errorKind: errorKind(error),
  };
  void invoke<void>("report_frontend_diagnostic", { ...request }).catch(() => {});
}

export function installFrontendDiagnostics(): () => void {
  if (typeof window === "undefined" || !isTauri()) return () => {};

  const onError = (event: ErrorEvent) => {
    // Window-level diagnostics should describe uncaught script errors. Error
    // events from failed images, media, and other resources have an element as
    // their target and can fire repeatedly while a view is being rendered.
    if (event.target && event.target !== window) return;
    const key = [
      "error",
      errorKind(event.error),
      event.message,
      event.filename,
      event.lineno,
      event.colno,
    ].join("|");
    if (!shouldReport(key)) return;
    reportFrontendDiagnostic("frontend_uncaught_error", "window", event.error);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const key = ["rejection", errorKind(event.reason), String(event.reason)].join("|");
    if (!shouldReport(key)) return;
    reportFrontendDiagnostic("frontend_unhandled_rejection", "window", event.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
