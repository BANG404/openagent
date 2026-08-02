import { isTauri } from "@tauri-apps/api/core";
import type { FrontendDiagnosticRequest } from "$lib/openagent/contracts";
import { invoke } from "$lib/openagent/tauriClient";

function errorKind(value: unknown): string {
  if (value instanceof Error) return value.name || "Error";
  if (typeof DOMException !== "undefined" && value instanceof DOMException && value.name) {
    return value.name;
  }
  return typeof value;
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
    reportFrontendDiagnostic("frontend_uncaught_error", "window", event.error);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportFrontendDiagnostic("frontend_unhandled_rejection", "window", event.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
