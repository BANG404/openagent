// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import {
  confirmFrontendActivationWithRetry,
  frontendActivationWasConfirmed,
} from "../src/lib/frontendActivation";

describe("frontend activation startup handshake", () => {
  test("retries a transient confirmation failure before exposing the frontend", async () => {
    let calls = 0;
    const waits: number[] = [];

    await confirmFrontendActivationWithRetry(
      "0.59.0-beta.2",
      async (version) => {
        calls += 1;
        expect(version).toBe("0.59.0-beta.2");
        if (calls < 3) throw new Error("Runtime is still reconnecting");
      },
      {
        attempts: 4,
        delayMs: 25,
        wait: async (delayMs) => {
          waits.push(delayMs);
        },
      },
    );

    expect(calls).toBe(3);
    expect(waits).toEqual([25, 25]);
    expect(frontendActivationWasConfirmed("0.59.0-beta.2")).toBe(true);
  });

  test("fails startup after the bounded retry budget", async () => {
    let calls = 0;
    const failure = new Error("confirmation unavailable");

    expect(
      confirmFrontendActivationWithRetry(
        "0.60.0-beta.1",
        async () => {
          calls += 1;
          throw failure;
        },
        { attempts: 3, delayMs: 0, wait: async () => {} },
      ),
    ).rejects.toBe(failure);
    expect(calls).toBe(3);
    expect(frontendActivationWasConfirmed("0.60.0-beta.1")).toBe(false);
  });
});
