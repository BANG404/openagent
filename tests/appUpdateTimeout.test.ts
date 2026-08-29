// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  APP_UPDATE_CHECK_TIMEOUT_MS,
  AppUpdateTimeoutError,
  RESOURCE_UPDATE_PREPARE_TIMEOUT_MS,
  withAppUpdateTimeout,
} from "$lib/appUpdateTimeout";

describe("application update timeout", () => {
  test("allows resource downloads substantially longer than metadata checks", () => {
    expect(APP_UPDATE_CHECK_TIMEOUT_MS).toBe(15_000);
    expect(RESOURCE_UPDATE_PREPARE_TIMEOUT_MS).toBe(10 * 60_000);
  });

  test("returns an update result before the deadline", async () => {
    await expect(withAppUpdateTimeout(Promise.resolve("current"), 50)).resolves.toBe("current");
  });

  test("rejects a stalled update check at the deadline", async () => {
    const stalled = new Promise<never>(() => {});
    await expect(withAppUpdateTimeout(stalled, 5)).rejects.toBeInstanceOf(AppUpdateTimeoutError);
  });
});
