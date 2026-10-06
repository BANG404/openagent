import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/routes/PageRuntime.svelte", import.meta.url);
const startupUrl = new URL("../src/lib/page/startup.ts", import.meta.url);
const hostDiagnosticsUrl = new URL("../src-tauri/src/diagnostics.rs", import.meta.url);

const STARTUP_DIAGNOSTICS = [
  "startup_bootstrap_failed",
  "startup_restore_failed",
  "startup_event_delivery_failed",
];

describe("startup Runtime event delivery", () => {
  test("keeps the Runtime subscription behind one guarded entry point", async () => {
    const [route, startup] = await Promise.all([
      readFile(routeUrl, "utf8"),
      readFile(startupUrl, "utf8"),
    ]);

    // The definition plus its single call site: a second direct call would
    // duplicate every Tauri listener and bypass the failure report.
    expect(route.match(/setupGlobalEventListeners\(\)/g)).toHaveLength(1);
    expect(startup.match(/options\.setupGlobalEventListeners\(\)/g)).toHaveLength(1);
    expect(route).toContain("setupGlobalEventListeners,");
    expect(startup).toContain("if (!options.tauriAvailable || eventDeliveryInstalled) return;");
    expect(startup).toContain("eventDeliveryInstalled = true;");
    expect(startup).toMatch(
      /reportFrontendDiagnostic\(\s*"startup_event_delivery_failed",\s*"page-shell",\s*error\);/s,
    );
  });

  test("subscribes on both the applied and the degraded startup path", async () => {
    const route = await readFile(startupUrl, "utf8");

    expect(route.match(/await installRuntimeEventDelivery\(\);/g)).toHaveLength(2);
  });

  test("retries the startup snapshot before restoring durable state", async () => {
    const route = await readFile(startupUrl, "utf8");

    // One attempt through the ordinary path, one through the retry.
    expect(route.match(/await applyStartupSnapshot\(\);/g)).toHaveLength(2);
    expect(route).toMatch(/const STARTUP_SNAPSHOT_RETRY_DELAY_MS = \d+;/);
    expect(route).toContain("await delay(STARTUP_SNAPSHOT_RETRY_DELAY_MS);");
    expect(route.match(/options\.restoreStartupFallback\(\)/g)).toHaveLength(1);
  });

  test("reports startup degradation through allowlisted host diagnostics", async () => {
    const [route, host] = await Promise.all([
      readFile(startupUrl, "utf8"),
      readFile(hostDiagnosticsUrl, "utf8"),
    ]);

    for (const eventName of STARTUP_DIAGNOSTICS) {
      expect(route).toContain(`reportFrontendDiagnostic("${eventName}", "page-shell"`);
      expect(host).toContain(`"${eventName}" => "${eventName}",`);
    }
    expect(host).toContain('"page-shell" => "page-shell",');
  });
});
