import { describe, expect, test } from "bun:test";
import { validate } from "../scripts/validate-agent-skills.mjs";

describe("agent skill contract", () => {
  test("has valid entrypoints, references, and primary-owner routing", () => {
    expect(validate()).toEqual([]);
  });
});
