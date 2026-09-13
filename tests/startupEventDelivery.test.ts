// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/routes/+page.svelte", import.meta.url);
const hostLibUrl = new URL("../src-tauri/src/lib.rs", import.meta.url);

const STARTUP_DIAGNOSTICS = [
  "startup_bootstrap_failed",
  "startup_restore_failed",
  "startup_event_delivery_failed",
];

describe("startup Runtime event delivery", () => {
  test("keeps the Runtime subscription behind one guarded entry point", async () => {
    const route = await readFile(routeUrl, "utf8");

    // The definition plus its single call site: a second direct call would
    // duplicate every Tauri listener and bypass the failure report.
    expect(route.match(/setupGlobalEventListeners\(\)/g)).toHaveLength(2);
    expect(route).toContain("if (!tauriAvailable || eventDeliveryInstalled) return;");
    expect(route).toContain("eventDeliveryInstalled = true;");
    expect(route).toMatch(
      /reportFrontendDiagnostic\(\s*"startup_event_delivery_failed",\s*"page-shell",\s*error\);/s,
    );
  });

  test("subscribes on both the applied and the degraded startup path", async () => {
    const route = await readFile(routeUrl, "utf8");

    expect(route.match(/await installRuntimeEventDelivery\(\);/g)).toHaveLength(2);
  });

  test("retries the startup snapshot before restoring durable state", async () => {
    const route = await readFile(routeUrl, "utf8");

    // One attempt through the ordinary path, one through the retry.
    expect(route.match(/await applyStartupSnapshot\(\);/g)).toHaveLength(2);
    expect(route).toMatch(/const STARTUP_SNAPSHOT_RETRY_DELAY_MS = \d+;/);
    expect(route).toContain("await delay(STARTUP_SNAPSHOT_RETRY_DELAY_MS);");
    expect(route.match(/restoreStartupFallback/g)).toHaveLength(2);
  });

  test("reports startup degradation through allowlisted host diagnostics", async () => {
    const [route, host] = await Promise.all([
      readFile(routeUrl, "utf8"),
      readFile(hostLibUrl, "utf8"),
    ]);

    for (const eventName of STARTUP_DIAGNOSTICS) {
      expect(route).toContain(`reportFrontendDiagnostic("${eventName}", "page-shell"`);
      expect(host).toContain(`"${eventName}" => "${eventName}",`);
    }
    expect(host).toContain('"page-shell" => "page-shell",');
  });
});
