// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { getMsiVersion } from "../scripts/release-version.mjs";

describe("MSI release versions", () => {
  test("keeps stable releases as three numeric components", () => {
    expect(getMsiVersion("0.24.1")).toBe("0.24.1");
  });

  test("maps a Beta sequence to the MSI build component", () => {
    expect(getMsiVersion("0.24.1-beta.1")).toBe("0.24.1.1");
    expect(getMsiVersion("0.24.1-beta.42")).toBe("0.24.1.42");
  });

  test("rejects unsupported prerelease labels and MSI component overflow", () => {
    expect(() => getMsiVersion("0.24.1-rc.1")).toThrow();
    expect(() => getMsiVersion("0.24.1-beta.65536")).toThrow();
  });
});
