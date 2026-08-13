// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { runtimeNoticeDetail } from "../src/lib/runtimeNotice";

describe("runtime notice detail", () => {
  test("hides the durable default interruption reason behind the localized title", () => {
    expect(
      runtimeNoticeDetail(
        {
          type: "runtime_notice",
          kind: "interrupted",
          reason: "The agent run was interrupted.",
        },
        "运行已中断",
      ),
    ).toBeUndefined();
  });

  test("hides a live interruption reason that repeats the localized title", () => {
    expect(
      runtimeNoticeDetail(
        { type: "runtime_notice", kind: "interrupted", reason: "运行已中断" },
        "运行已中断",
      ),
    ).toBeUndefined();
  });

  test("retains informative interruption and error details", () => {
    expect(
      runtimeNoticeDetail(
        { type: "runtime_notice", kind: "interrupted", reason: "Connection closed unexpectedly" },
        "运行已中断",
      ),
    ).toBe("Connection closed unexpectedly");
    expect(
      runtimeNoticeDetail(
        { type: "runtime_notice", kind: "error", reason: "Run failed" },
        "Run failed",
      ),
    ).toBe("Run failed");
  });
});
