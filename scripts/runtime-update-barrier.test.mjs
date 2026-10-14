import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { tauriRuntimeUpdateBarrier } from "../vite.config.js";
import {
  runtimeServerPendingStampPath,
  runtimeServerReloadStampPath,
  writeRuntimeServerPendingStamp,
} from "./runtime-server-dev-signals.mjs";

/** @param {() => boolean} condition */
async function waitForOffer(condition) {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error("Runtime update offer did not arrive");
    await new Promise((done) => setTimeout(done, 10));
  }
}

test("reoffers startup and newly added Runtime signals until one idle acknowledgement consumes them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-barrier-"));
  const watcher = new EventEmitter();
  watcher.add = () => {};
  const ws = new EventEmitter();
  const offered = [];
  ws.send = (message) => offered.push(message);
  const httpServer = new EventEmitter();
  const plugin = tauriRuntimeUpdateBarrier(root);
  try {
    await writeRuntimeServerPendingStamp(root, { revision: 1 });
    plugin.configureServer({ watcher, ws, httpServer, config: { logger: { warn() {} } } });
    await waitForOffer(
      () => offered.filter((message) => message.data.kind === "runtime").length >= 2,
    );
    expect(
      offered.filter((message) => message.data.kind === "runtime").length,
    ).toBeGreaterThanOrEqual(2);
    expect(await readFile(runtimeServerReloadStampPath(root)).catch(() => null)).toBeNull();
    const accept = ws.listeners("openagent:component-update-ready")[0];
    await Promise.all([accept({ kind: "runtime" }), accept({ kind: "runtime" })]);
    expect(JSON.parse(await readFile(runtimeServerReloadStampPath(root), "utf8")).revision).toBe(1);
    expect(await readFile(runtimeServerPendingStampPath(root)).catch(() => null)).toBeNull();
    const count = offered.length;
    await new Promise((done) => setTimeout(done, 1100));
    expect(offered.length).toBe(count);
    await writeRuntimeServerPendingStamp(root, { revision: 2 });
    watcher.emit("add", runtimeServerPendingStampPath(root));
    await waitForOffer(() => offered.length > count);
    expect(offered.length).toBeGreaterThan(count);
    await accept({ kind: "runtime" });
    expect(JSON.parse(await readFile(runtimeServerReloadStampPath(root), "utf8")).revision).toBe(2);
  } finally {
    httpServer.emit("close");
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
