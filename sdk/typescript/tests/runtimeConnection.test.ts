import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { connectRuntime } from "../src/runtimeProcess.js";
import { assertRuntimeVersion, runtimeOrigin } from "../src/runtimeConnection.js";
import type { RuntimeRelease } from "../src/runtimeRelease.js";
import { ensureRuntime, startRuntime } from "../src/runtime.js";

test("rejects incompatible Runtime versions and non-loopback origins", () => {
  const release = { version: "4.1.2" } as RuntimeRelease;
  expect(() => assertRuntimeVersion("4.1.2", release)).not.toThrow();
  expect(() => assertRuntimeVersion("4.2.0", release)).not.toThrow();
  for (const version of ["4.1.1", "4.0.9", "5.0.0", "4.2.0-dev.1"])
    expect(() => assertRuntimeVersion(version, release)).toThrow();
  for (const endpoint of [
    "https://127.0.0.1",
    "http://example.com",
    "http://u:p@localhost",
    "http://localhost/api",
    "http://localhost/#secret",
  ])
    expect(() => runtimeOrigin(endpoint)).toThrow();
});

test("an external owner supplies readiness; live PID, bearer requests and scoped SSE are verified", async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    expect(request.headers.authorization).toBe("Bearer fixture-owner-token");
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/desktop/health")
      return response.end(JSON.stringify({ status: "ok", pid: 123 }));
    if (request.url === "/api/desktop/operations")
      return response.end(JSON.stringify({ fixture: true }));
    response.setHeader("content-type", "text/event-stream");
    response.write('event: state\r\ndata: {"fixture":"stream"}\r\n\r\n');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const options = {
    endpoint: `http://127.0.0.1:${address.port}`,
    token: "fixture-owner-token",
    version: "4.0.0",
    pid: 123,
    protocol: { min: 3, max: 3 },
  };
  try {
    await expect(connectRuntime({ ...options, pid: 456 })).rejects.toThrow("readiness record");
    await expect(connectRuntime({ ...options, protocol: { min: 2, max: 2 } })).rejects.toThrow(
      "protocol",
    );
    const client = await connectRuntime(options);
    expect(await client.invokeProduct("get_settings", {})).toEqual({ fixture: true });
    let received: unknown;
    let unsubscribe = () => {};
    const observed = new Promise<void>((done) => {
      void client
        .subscribeToConversationState("c 1", (value) => {
          received = value;
          done();
        })
        .then((stop) => {
          unsubscribe = stop;
        });
    });
    await observed;
    unsubscribe();
    expect(received).toEqual({ fixture: "stream" });
    expect(requests).toContain("/api/conversations/c%201/events");
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("source SDK requires an explicit release and startup requires explicit data ownership", async () => {
  await expect(ensureRuntime()).rejects.toThrow("no recommended Runtime");
  await expect(startRuntime({ workspace: ".", home: "" })).rejects.toThrow("Explicit Runtime home");
});
