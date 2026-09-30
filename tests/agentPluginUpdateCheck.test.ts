import { describe, expect, test } from "bun:test";
import { classifyAgentPluginUpdateCheck } from "../src/lib/agentPluginUpdateCheck";
import type { AgentPluginUpdateSummary } from "../src/lib/types";

function summary(overrides: Partial<AgentPluginUpdateSummary>): AgentPluginUpdateSummary {
  return {
    id: "example",
    current_version: "1.0.0",
    latest_version: "1.0.0",
    release_url: null,
    asset_name: null,
    asset_url: null,
    asset_digest: null,
    update_available: false,
    error: null,
    ...overrides,
  };
}

describe("explicit Agent Plugin update check", () => {
  test("reports how many plugins have an update", () => {
    expect(
      classifyAgentPluginUpdateCheck([
        summary({ id: "a", update_available: true, latest_version: "2.0.0" }),
        summary({ id: "b" }),
        summary({ id: "c", update_available: true, latest_version: "1.1.0" }),
      ]),
    ).toEqual({ kind: "available", count: 2 });
  });

  test("reports current only when every plugin produced release metadata", () => {
    expect(classifyAgentPluginUpdateCheck([summary({ id: "a" }), summary({ id: "b" })])).toEqual({
      kind: "current",
    });
  });

  test("keeps plugins without a repository out of the incomplete count", () => {
    // A plugin with no `repository` reports no error and no release metadata.
    expect(
      classifyAgentPluginUpdateCheck([summary({ id: "a", latest_version: null, error: null })]),
    ).toEqual({ kind: "current" });
  });

  test("never claims plugins are current when a release lookup failed", () => {
    expect(
      classifyAgentPluginUpdateCheck([
        summary({ id: "a" }),
        summary({ id: "b", latest_version: null, error: "request timed out" }),
      ]),
    ).toEqual({ kind: "incomplete", count: 1 });
  });

  test("prefers the available-update count over failed lookups", () => {
    expect(
      classifyAgentPluginUpdateCheck([
        summary({ id: "a", update_available: true, latest_version: "2.0.0" }),
        summary({ id: "b", latest_version: null, error: "request timed out" }),
      ]),
    ).toEqual({ kind: "available", count: 1 });
  });

  test("treats a failed command as its own outcome", () => {
    expect(classifyAgentPluginUpdateCheck(null)).toEqual({ kind: "failed" });
    expect(classifyAgentPluginUpdateCheck([])).toEqual({ kind: "current" });
  });
});
