// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { findAvailableLoopbackPort, mergeDevUrlConfig } from "../scripts/tauri-dev-port.mjs";

describe("Tauri development port selection", () => {
  test("selects an ephemeral TCP port", async () => {
    const port = await findAvailableLoopbackPort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  test("merges the selected URL without discarding Tauri configuration", () => {
    expect(
      mergeDevUrlConfig('{"app":{"windows":[]},"build":{"beforeDevCommand":"bun run dev"}}', 54321),
    ).toEqual(
      '{"app":{"windows":[]},"build":{"beforeDevCommand":"bun run dev","devUrl":"http://localhost:54321"}}',
    );
  });
});
