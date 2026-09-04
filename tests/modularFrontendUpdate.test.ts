// @ts-nocheck -- Bun provides the test module at runtime.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const updater = readFileSync("src/lib/appUpdater.ts", "utf8");
const route = readFileSync("src/routes/+page.svelte", "utf8");
const host = readFileSync("src-tauri/src/lib.rs", "utf8");

test("production update checks stage and activate a verified frontend resource", () => {
  expect(updater).toContain('invoke<PreparedFrontendResource>("prepare_frontend_resource")');
  expect(updater).toContain('invoke<void>("activate_frontend_resource"');
  expect(updater).toContain('translate("updateComponentFrontend")');
  expect(updater).toContain('translate("frontendUpdateInProgressDescription")');
  expect(updater).toContain("if (import.meta.env.DEV) return null");
  expect(updater).toContain("RESOURCE_UPDATE_PREPARE_TIMEOUT_MS");
});

test("production update checks aggregate Runtime and Shell updates", () => {
  expect(updater).toContain('invoke<PreparedRuntimeResource>("prepare_runtime_resource")');
  expect(updater).toContain('invoke("activate_runtime_resource"');
  expect(updater).toContain('translate("updateComponentRuntime")');
  expect(updater).toContain('translate("updateComponentShell")');
  expect(updater).toContain("const shellDownload = shell ? shell.download() : null");
  expect(updater).toContain("await updates.shell.install()");
  expect(updater).not.toContain("downloadAndInstall");
  expect(updater).toContain('translate("updateAll")');
  expect(updater).toContain('invoke<ComponentUpdateGate>("begin_component_update")');
  expect(updater).toContain('invoke("end_component_update")');
  expect(updater).toContain('translate("updateDeferredActiveAgent")');
});

test("versioned WebViews confirm activation through the host handshake", () => {
  expect(route).toContain('runtimeQuery?.get("frontend-version")');
  expect(route).toContain('invoke("confirm_frontend_activation"');
  expect(host).toContain("rollback_pending().await");
  expect(host).toContain("Duration::from_secs(15)");
  expect(host).toContain("openagent-ui://localhost/");
});

test("component activation waits for active agents without cancelling them", () => {
  expect(host).toContain("drain_supervised_runtime(supervisor.inner(), false)");
  expect(host).not.toContain('body: Some("{\\"cancel\\":true}".to_string())');
  expect(host).toContain('path: "/api/desktop/resume".to_string()');
  expect(host).toContain("frontend activation requires an active component update barrier");
});
