// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import {
  getMsiVersion,
  isBetaReleaseRefresh,
  getLatestReleaseTag,
  getNextBetaNumber,
  getNextReleaseVersion,
  getReleaseLine,
  getStablePromotion,
} from "../scripts/release-version.mjs";

describe("unpublished Beta refreshes", () => {
  const previous = {
    ready: true,
    version: "1.2.3-beta.1",
    tag: "v1.2.3-beta.1",
    channel: "beta",
    sourceSha: "1111111111111111111111111111111111111111",
    previousTag: "v1.2.2-beta.1",
  };
  const current = {
    ...previous,
    sourceSha: "2222222222222222222222222222222222222222",
  };

  test("accepts only a marker-only move of the same unpublished identity", () => {
    expect(
      isBetaReleaseRefresh(previous, current, [".github/release.json"], ".github/release.json"),
    ).toBe(true);
    expect(
      isBetaReleaseRefresh(
        previous,
        { ...current, version: "1.2.3-beta.2", tag: "v1.2.3-beta.2" },
        [".github/release.json"],
        ".github/release.json",
      ),
    ).toBe(false);
  });

  test("rejects stable promotions and refreshes mixed with other file changes", () => {
    expect(
      isBetaReleaseRefresh(
        previous,
        { ...current, channel: "stable" },
        [".github/release.json"],
        ".github/release.json",
      ),
    ).toBe(false);
    expect(
      isBetaReleaseRefresh(
        previous,
        current,
        [".github/release.json", "package.json"],
        ".github/release.json",
      ),
    ).toBe(false);
  });
});

describe("release tag precedence", () => {
  test("selects the highest SemVer across divergent release branches", () => {
    expect(
      getLatestReleaseTag(["v0.29.9", "v0.30.0-beta.1", "v0.30.0-beta.3", "not-a-release"]),
    ).toBe("v0.30.0-beta.3");
  });

  test("prefers Stable over Beta for the same base", () => {
    expect(getLatestReleaseTag(["v1.2.3-beta.9", "v1.2.3"])).toBe("v1.2.3");
  });
});

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

describe("release lines", () => {
  test("derives X.Y from planned Beta versions and selected Beta tags", () => {
    expect(getReleaseLine("1.2.3-beta.4")).toBe("1.2");
    expect(getReleaseLine("v1.2.3-beta.4")).toBe("1.2");
    expect(getReleaseLine("1.2.3")).toBe("1.2");
  });

  test("rejects values that cannot identify a release line", () => {
    expect(() => getReleaseLine("1.2")).toThrow();
    expect(() => getReleaseLine("release/1.2")).toThrow();
    expect(() => getReleaseLine("v1.2.3-rc.1")).toThrow();
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

describe("Stable promotion sources", () => {
  test("maps a selected Beta on the release line to its Stable tag", () => {
    expect(getStablePromotion("v1.2.3-beta.4", "1.2")).toEqual({
      sourceVersion: "1.2.3-beta.4",
      version: "1.2.3",
      tag: "v1.2.3",
    });
  });

  test("rejects malformed tags and tags from another release line", () => {
    expect(() => getStablePromotion("v1.2.3", "1.2")).toThrow();
    expect(() => getStablePromotion("v1.3.0-beta.1", "1.2")).toThrow();
    expect(() => getStablePromotion("v1.2.3-beta.1", "release/1.2")).toThrow();
  });
});
