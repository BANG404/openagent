import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DIRECT_LOCK_TTL_MS,
  acquireDirectLock,
  inspectDirectLock,
  releaseDirectLock,
  withDirectLock,
} from "../scripts/agent-delivery-lock.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function lockFixture() {
  const root = mkdtempSync(join(tmpdir(), "openagent-direct-lock-"));
  temporaryRoots.push(root);
  return join(root, "direct.lock");
}

describe("direct delivery lock", () => {
  test("serializes owners and releases the lock", () => {
    const lockPath = lockFixture();
    acquireDirectLock(lockPath, { taskId: "first" });
    expect(inspectDirectLock(lockPath).owner.taskId).toBe("first");
    expect(() => acquireDirectLock(lockPath, { taskId: "second" })).toThrow(
      "Direct delivery lock is held",
    );
    releaseDirectLock(lockPath);
    expect(inspectDirectLock(lockPath).active).toBe(false);
  });

  test("reclaims an expired lock owned by a dead process", () => {
    const lockPath = lockFixture();
    mkdirSync(lockPath);
    writeFileSync(
      join(lockPath, "owner.json"),
      JSON.stringify({
        pid: 999_999,
        taskId: "dead",
        acquiredAt: new Date(Date.now() - DIRECT_LOCK_TTL_MS - 1).toISOString(),
      }),
    );
    expect(inspectDirectLock(lockPath).stale).toBe(true);
    withDirectLock(lockPath, { taskId: "replacement" }, () => {
      expect(inspectDirectLock(lockPath).owner.taskId).toBe("replacement");
    });
    expect(existsSync(lockPath)).toBe(false);
  });
});
