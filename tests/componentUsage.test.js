import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";
import {
  componentSourceErrors,
  componentUsageErrors,
  sharedUiFiles,
} from "../scripts/check-component-usage.mjs";

describe("shared frontend component contract", () => {
  test("the checked-in frontend stays within the shared-control baseline", () => {
    expect(componentUsageErrors()).toEqual([]);
  });

  test("rejects native select and dialog elements", () => {
    const errors = componentSourceErrors(
      "<select><option>One</option></select><dialog open>Dialog</dialog>",
      "fixture.svelte",
    );

    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toContain("shared Select component");
    expect(errors.join("\n")).toContain("Bits UI Dialog");
  });

  test("rejects new native checkbox and radio controls", () => {
    const errors = componentSourceErrors(
      '<input type="checkbox" /><input type="radio" />',
      "new-component.svelte",
    );

    expect(errors).toEqual([
      "new-component.svelte: native checkbox/radio controls are not allowed; use the shared Switch or SegmentedControl component.",
    ]);
  });

  test("exposes the same contract through the frontend ESLint config", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText("<select></select>", {
      filePath: "src/lib/components/contract-fixture.svelte",
    });

    expect(result.messages).toContainEqual(
      expect.objectContaining({
        ruleId: "openagent/component-usage",
        message: expect.stringContaining("shared Select component"),
      }),
    );
  });

  test("keeps a shared UI directory available for reusable primitives", () => {
    expect(sharedUiFiles().length).toBeGreaterThan(0);
  });
});
