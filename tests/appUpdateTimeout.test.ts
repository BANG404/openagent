import { describe, expect, test } from "bun:test";
import { AppUpdateTimeoutError, withAppUpdateTimeout } from "$lib/appUpdateTimeout";

describe("application update timeout", () => {
  test("returns an update result before the deadline", async () => {
    await expect(withAppUpdateTimeout(Promise.resolve("current"), 50)).resolves.toBe("current");
  });

  test("rejects a stalled update check at the deadline", async () => {
    const stalled = new Promise<never>(() => {});
    await expect(withAppUpdateTimeout(stalled, 5)).rejects.toBeInstanceOf(AppUpdateTimeoutError);
  });
});
