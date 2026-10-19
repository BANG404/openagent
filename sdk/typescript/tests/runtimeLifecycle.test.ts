import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startRuntime } from "../src/runtime.js";

let directory: string;
let binaryPath: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "openagent-sdk-lifecycle-"));
  binaryPath = join(directory, process.platform === "win32" ? "fixture.exe" : "fixture");
  execFileSync(
    process.execPath,
    [
      "build",
      "--compile",
      fileURLToPath(new URL("./fixtures/runtimeLifecycle.ts", import.meta.url)),
      "--outfile",
      binaryPath,
    ],
    { stdio: "pipe" },
  );
}, 30000);
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("starts a real owned process, authenticates and stops idempotently", async () => {
  const home = join(directory, "ready");
  const runtime = await startRuntime({ binaryPath, home, workspace: directory });
  expect(await runtime.client.invokeProduct("get_settings", {})).toEqual({ fixture: true });
  await Promise.all([runtime.stop(), runtime.stop()]);
  expect(await readFile(join(home, "stopped"), "utf8")).toBe("graceful");
});

test("refuses persistence transitions before launching the writer", async () => {
  const home = join(directory, "transition");
  await expect(startRuntime({ binaryPath, home, workspace: directory })).rejects.toThrow(
    "transition_required",
  );
  expect(await stat(join(home, "started")).catch(() => null)).toBeNull();
});

for (const [scenario, message] of [
  ["bad-protocol", "Incompatible Runtime"],
  ["invalid-json", "Invalid Runtime readiness"],
  ["silent", "timed out"],
]) {
  test(`reaps the process after ${scenario}`, async () => {
    const home = join(directory, scenario);
    await expect(
      startRuntime({ binaryPath, home, workspace: directory, startupTimeoutMs: 300 }),
    ).rejects.toThrow(message);
    expect(await readFile(join(home, "stopped"), "utf8")).toBe("graceful");
  });
}
test("reports an early Runtime exit", async () => {
  await expect(
    startRuntime({ binaryPath, home: join(directory, "exit"), workspace: directory }),
  ).rejects.toThrow("exited before readiness");
});
