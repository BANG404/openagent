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
});

test("versioned WebViews confirm activation through the host handshake", () => {
  expect(route).toContain('runtimeQuery?.get("frontend-version")');
  expect(route).toContain('invoke("confirm_frontend_activation"');
  expect(host).toContain("rollback_pending().await");
  expect(host).toContain("Duration::from_secs(15)");
  expect(host).toContain("openagent-ui://localhost/");
});
