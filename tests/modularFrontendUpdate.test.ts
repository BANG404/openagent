// @ts-nocheck -- Bun provides the test module at runtime.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const updater = readFileSync("src/lib/appUpdater.ts", "utf8");
const route = readFileSync("src/routes/+page.svelte", "utf8");
const host = readFileSync("src-tauri/src/lib.rs", "utf8");

test("production update checks prefer a verified frontend resource without restarting", () => {
  expect(updater).toContain('invoke<PreparedFrontendResource>("prepare_frontend_resource")');
  expect(updater).toContain('invoke<void>("activate_frontend_resource"');
  expect(updater).toContain('translate("updateAndReload")');
  expect(updater).toContain("if (import.meta.env.DEV) return false");
});

test("versioned WebViews confirm activation through the host handshake", () => {
  expect(route).toContain('runtimeQuery?.get("frontend-version")');
  expect(route).toContain('invoke("confirm_frontend_activation"');
  expect(host).toContain("rollback_pending().await");
  expect(host).toContain("Duration::from_secs(15)");
  expect(host).toContain("openagent-ui://localhost/");
});
