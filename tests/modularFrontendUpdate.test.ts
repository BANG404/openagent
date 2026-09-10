// @ts-nocheck -- Bun provides the test module at runtime.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const updater = readFileSync("src/lib/appUpdater.ts", "utf8");
const route = readFileSync("src/routes/+page.svelte", "utf8");
const clientHooks = readFileSync("src/hooks.client.ts", "utf8");
const host = readFileSync("src-tauri/src/lib.rs", "utf8");

test("production update checks stage and activate a verified frontend resource", () => {
  expect(updater).toContain('invoke<PreparedFrontendResource>("prepare_frontend_resource")');
  expect(updater).toContain('invoke<void>("activate_frontend_resource"');
  expect(updater).toContain('translate("updateComponentFrontend")');
  expect(updater).toContain("current_version: string");
  expect(updater).toContain('translate("frontendUpdateInProgressDescription")');
  expect(updater).toContain("if (import.meta.env.DEV) return null");
  expect(updater).toContain("RESOURCE_UPDATE_PREPARE_TIMEOUT_MS");
});

test("production update checks aggregate Runtime and Shell updates", () => {
  expect(updater).toContain('invoke<PreparedRuntimeResource>("prepare_runtime_resource")');
  expect(updater).toContain('invoke("activate_runtime_resource"');
  expect(updater).toContain('translate("updateComponentRuntime")');
  expect(updater).toContain('translate("updateComponentShell")');
  expect(updater).toContain("shell.currentVersion");
  expect(updater).toContain("formatComponentVersionTransitions");
  expect(updater).toContain('title: translate("updateAvailable")');
  expect(updater).toContain("const shellDownload = shell ? downloadShellUpdate(shell) : null");
  expect(updater).toContain("await installShellUpdate(updates.shell)");
  expect(updater).not.toContain("downloadAndInstall");
  expect(updater).toContain('translate("updateAll")');
  expect(updater).toContain('invoke<ComponentUpdateGate>("begin_component_update")');
  expect(updater).toContain('invoke("end_component_update")');
  expect(updater).toContain('translate("updateDeferredActiveAgent")');
});

test("versioned WebViews confirm activation through the host handshake", () => {
  expect(clientHooks).toContain('get("frontend-version")');
  expect(clientHooks).toContain('invoke("confirm_frontend_activation"');
  expect(clientHooks).toContain("confirmFrontendActivationWithRetry");
  expect(clientHooks).toContain('reportComponentUpdateEvent("frontend", "confirmation_started"');
  expect(route).toContain("frontendActivationWasConfirmed");
  expect(updater).toContain("if (!updates.frontend)");
  expect(host).toContain("rollback_pending().await");
  expect(host).toContain("Duration::from_secs(15)");
  expect(host).toContain('"http://openagent-ui.localhost/"');
  expect(host).toContain('"openagent-ui://localhost/"');
  expect(host).toContain('stage = "confirmation_timed_out"');
  expect(host).toContain("manager.rollback_pending().await");
});

test("component lifecycle diagnostics cover shell, Runtime, and frontend stages", () => {
  expect(updater).toContain('reportComponentUpdateEvent("shell", "check_started")');
  expect(updater).toContain('reportComponentUpdateEvent("shell", "download_started"');
  expect(updater).toContain('reportComponentUpdateEvent("shell", "install_started"');
  expect(host).toContain('component = "runtime"');
  expect(host).toContain('stage = "activation_finished"');
  expect(host).toContain('component = "frontend"');
  expect(host).toContain('stage = "confirmation_finished"');
  expect(host).toContain('"openagent-host.jsonl"');
});

test("component activation waits for active agents without cancelling them", () => {
  expect(host).toContain("drain_supervised_runtime(supervisor.inner(), false)");
  expect(host).not.toContain('body: Some("{\\"cancel\\":true}".to_string())');
  expect(host).toContain('path: "/api/desktop/resume".to_string()');
  expect(host).toContain("frontend activation requires an active component update barrier");
});
