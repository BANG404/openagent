// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import {
  getMsiVersion,
  getNextBetaNumber,
  getNextReleaseVersion,
} from "../scripts/release-version.mjs";

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

describe("Beta release numbers", () => {
  test("continues from the checked-in version when tags are unavailable", () => {
    expect(getNextBetaNumber("0.24.1", [], "0.24.1-beta.7")).toBe(8);
  });

  test("uses the highest matching tag or checked-in version", () => {
    expect(
      getNextBetaNumber(
        "0.24.1",
        ["v0.24.1-beta.3", "v0.24.1-beta.9", "v0.24.0-beta.99"],
        "0.24.1-beta.7",
      ),
    ).toBe(10);
  });

  test("starts at one after the X.Y.Z base changes", () => {
    expect(getNextBetaNumber("0.25.0", ["v0.24.1-beta.9"], "0.24.1-beta.7")).toBe(1);
  });
});

describe("release channel versions", () => {
  test("applies the same commit bump before selecting Beta or Stable", () => {
    expect(getNextReleaseVersion("1.2.3", "minor", "beta").version).toBe("1.3.0-beta.1");
    expect(getNextReleaseVersion("1.2.3", "minor", "stable").version).toBe("1.3.0");
  });

  test("increments Beta on the same base only without a new bump", () => {
    expect(getNextReleaseVersion("1.2.3-beta.7", "none", "beta", { betaNumber: 8 }).version).toBe(
      "1.2.3-beta.8",
    );
    expect(getNextReleaseVersion("1.2.3-beta.7", "patch", "beta").version).toBe("1.2.4-beta.1");
  });

  test("promotes an unchanged Beta or bumps a changed Beta to Stable", () => {
    expect(getNextReleaseVersion("1.2.3-beta.7", "none", "stable")).toEqual({
      version: "1.2.3",
      baseVersion: "1.2.3",
      promotion: true,
    });
    expect(getNextReleaseVersion("1.2.3-beta.7", "minor", "stable").version).toBe("1.3.0");
  });
});
