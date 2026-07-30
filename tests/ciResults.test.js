// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { verifyCiResults } from "../scripts/verify-ci-results.mjs";

function state(overrides = {}) {
  return {
    changes: "success",
    modules: {
      automation: { selected: false, result: "skipped" },
      frontend: { selected: true, result: "success" },
      native: { selected: false, result: "skipped" },
    },
    ...overrides,
  };
}

describe("required CI result verification", () => {
  test("accepts successful selected modules and skipped unselected modules", () => {
    expect(() => verifyCiResults(state())).not.toThrow();
  });

  test("rejects a selected module that was skipped", () => {
    const input = state();
    input.modules.frontend.result = "skipped";
    expect(() => verifyCiResults(input)).toThrow(
      "frontend was selected but finished with: skipped",
    );
  });

  test("rejects failed change detection", () => {
    expect(() => verifyCiResults(state({ changes: "failure" }))).toThrow(
      "Change detection finished with: failure",
    );
  });

  test("rejects an unexpected result from an unselected module", () => {
    const input = state();
    input.modules.native.result = "cancelled";
    expect(() => verifyCiResults(input)).toThrow(
      "native was not selected but finished with: cancelled",
    );
  });
});
