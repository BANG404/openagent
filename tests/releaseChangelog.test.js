// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import {
  isReleaseRefreshChangelog,
  replaceCurrentReleaseSection,
} from "../scripts/release-changelog.mjs";

const previous = `# Changelog

Intro.

## [1.2.3-beta.1] - 2026-09-01

### Bug Fixes
- First fix

## [1.2.2-beta.1] - 2026-08-31

- Older history
`;

describe("release changelog refreshes", () => {
  test("replaces only the current unpublished release section", () => {
    const section = `## [1.2.3-beta.1] - 2026-09-01

### Bug Fixes
- First fix
- Later fix
`;
    const refreshed = replaceCurrentReleaseSection(previous, "1.2.3-beta.1", section);

    expect(refreshed).toContain("- Later fix");
    expect(refreshed).toEndWith("## [1.2.2-beta.1] - 2026-08-31\n\n- Older history\n");
    expect(isReleaseRefreshChangelog(previous, refreshed, "1.2.3-beta.1")).toBe(true);
  });

  test("rejects older history changes", () => {
    const changedHistory = previous.replace("Older history", "Rewritten history");
    expect(isReleaseRefreshChangelog(previous, changedHistory, "1.2.3-beta.1")).toBe(false);
  });
});
