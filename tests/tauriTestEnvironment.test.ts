import { describe, expect, test } from "bun:test";

import { developmentInstanceHome } from "../scripts/tauri-dev-instance.mjs";
import { blackboxInstanceName, resolveBlackboxHome } from "../scripts/tauri-test-environment.mjs";

describe("Tauri black-box test environment", () => {
  test("uses the same durable instance home as the debug launcher", () => {
    expect(resolveBlackboxHome({}, { homeDirectory: "/tmp/test-user" })).toBe(
      developmentInstanceHome("blackbox", { homeDirectory: "/tmp/test-user" }),
    );
  });

  test("preserves an explicitly selected fixture home", () => {
    expect(resolveBlackboxHome({ OPENAGENT_HOME: "/tmp/model-fixture" })).toBe(
      "/tmp/model-fixture",
    );
  });

  test("normalizes the instance name used by the shared environment", () => {
    expect(blackboxInstanceName({ OPENAGENT_DEV_INSTANCE: "visual test" })).toBe("visual-test");
  });
});
