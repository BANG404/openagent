// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import { runQuickChatSubmission } from "../src/lib/quickChatSubmission";

describe("runQuickChatSubmission", () => {
  test("restores the main window after starting a submission", async () => {
    const events: string[] = [];

    await runQuickChatSubmission(
      async () => {
        events.push("start");
      },
      async () => {
        events.push("restore");
      },
      () => {
        events.push("error");
      },
    );

    expect(events).toEqual(["start", "restore"]);
  });

  test("reports startup failures and still restores the main window", async () => {
    const failure = new Error("branch creation failed");
    const events: string[] = [];
    let reported: unknown;

    await runQuickChatSubmission(
      async () => {
        events.push("start");
        throw failure;
      },
      async () => {
        events.push("restore");
      },
      (error) => {
        reported = error;
        events.push("error");
      },
    );

    expect(reported).toBe(failure);
    expect(events).toEqual(["start", "error", "restore"]);
  });
});
