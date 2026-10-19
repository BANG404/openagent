import assert from "node:assert/strict";
import { mock } from "bun:test";

const calls: string[] = [];
let available = false;
let listeners = 0;
mock.module("@tauri-apps/api/core", () => ({
  async invoke(command: string, args?: { request?: { path: string } }) {
    calls.push(command);
    if (command === "start_runtime_event_proxy") {
      if (!available) throw new Error("Runtime unavailable");
      return 1;
    }
    assert.equal(command, "proxy_runtime_request", "product requests must use the proxy");
    if (!available) throw new Error("Runtime starting");
    return {
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      body: JSON.stringify(args?.request?.path === "/api/desktop/bootstrap" ? { ready: true } : []),
    };
  },
}));
mock.module("@tauri-apps/api/event", () => ({
  async listen() {
    listeners += 1;
    return () => {
      listeners -= 1;
    };
  },
}));

const { TauriTransport } = await import("../../src/tauriTransport");
const client = new TauriTransport();
await assert.rejects(client.request("product.get_startup_bootstrap", {}), /Runtime starting/);
await assert.rejects(
  client.subscribe("chat.chunk", () => {}),
  /Runtime unavailable/,
);
assert.equal(listeners, 0, "failed relay startup must release its listener");
available = true;
assert.deepEqual(await client.request("product.get_startup_bootstrap", {}), { ready: true });
await client.request("product.invoke_desktop", { operation: "get_settings", args: {} });
const stop = await client.subscribe("chat.chunk", () => {});
assert.equal(listeners, 1);
stop();
assert.equal(listeners, 0);
available = false;
await assert.rejects(
  client.request("product.invoke_desktop", { operation: "get_settings", args: {} }),
  /Runtime starting/,
);
available = true;
await client.request("product.invoke_desktop", { operation: "get_settings", args: {} });
assert(
  calls.every((command) =>
    ["proxy_runtime_request", "start_runtime_event_proxy"].includes(command),
  ),
);
console.log("Standalone Runtime transport recovers without a mode cache or command fallback.");
