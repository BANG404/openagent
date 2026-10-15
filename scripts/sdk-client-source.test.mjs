import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sdkClientSource } from "./sdk-client-source.mjs";
import { readDesktopRuntimeProtocol } from "./runtime-protocol.mjs";
import { OPENAGENT_PROTOCOL_VERSION } from "../sdk/typescript/src/contracts.ts";

test("the public client and host require the same Runtime protocol without private source", () => {
  expect(OPENAGENT_PROTOCOL_VERSION).toBe(readDesktopRuntimeProtocol());
});

test("cached kits cannot override the SDK owned by the host checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "openagent-public-sdk-"));
  try {
    const cache = join(root, ".cache/openagent-dev-kit/client/src");
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, "index.ts"), "throw new Error('obsolete client');");
    expect(sdkClientSource(root)).toBe(join(root, "sdk/typescript/src"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
