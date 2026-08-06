// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { addDevUrlConfigArgument, findAvailableLoopbackPort } from "../scripts/tauri-dev-port.mjs";

describe("Tauri development port selection", () => {
  test("selects an ephemeral TCP port", async () => {
    const port = await findAvailableLoopbackPort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  test("passes the selected URL to the Tauri CLI", () => {
    expect(addDevUrlConfigArgument(["dev", "--verbose"], 54321)).toEqual([
      "dev",
      "--verbose",
      "--config",
      '{"build":{"devUrl":"http://localhost:54321"}}',
    ]);
  });

  test("places configuration before runner arguments", () => {
    expect(addDevUrlConfigArgument(["dev", "--", "--features", "fixture"], 54321)).toEqual([
      "dev",
      "--config",
      '{"build":{"devUrl":"http://localhost:54321"}}',
      "--",
      "--features",
      "fixture",
    ]);
  });
});
