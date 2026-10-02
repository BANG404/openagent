import { describe, expect, test } from "bun:test";
import {
  agentPluginUpdateErrorKey,
  classifyAgentPluginUpdateCheck,
  coalesceAgentPluginUpdateCheck,
  shouldNotifyAgentPluginUpdates,
} from "../src/lib/agentPluginUpdateCheck";
import { en } from "../src/lib/i18n.en";
import { zh } from "../src/lib/i18n.zh";
import type {
  AgentPluginUpdateCheck,
  AgentPluginUpdateErrorKind,
  AgentPluginUpdateReport,
  AgentPluginUpdateSummary,
} from "../src/lib/types";

const UNREADABLE_RELEASE = {
  error: "GitHub has no readable release for this repository (404 Not Found)",
  error_kind: "release_unavailable" as const,
};

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
    error_kind: null,
    stale: false,
    ...overrides,
  };
}

function report(
  updates: AgentPluginUpdateSummary[],
  check: Partial<AgentPluginUpdateCheck> = {},
): AgentPluginUpdateReport {
  return {
    updates,
    check: {
      status: "ok",
      checked: updates.length,
      cached: 0,
      rate_limit_reset: null,
      ...check,
    },
  };
}

describe("explicit Agent Plugin update check", () => {
  test("reports how many plugins have an update", () => {
    expect(
      classifyAgentPluginUpdateCheck(
        report([
          summary({ id: "a", update_available: true, latest_version: "2.0.0" }),
          summary({ id: "b" }),
          summary({ id: "c", update_available: true, latest_version: "1.1.0" }),
        ]),
      ),
    ).toEqual({ outcome: { kind: "available", count: 2, failures: [] }, fromCache: false });
  });

  test("reports current only when every plugin produced release metadata", () => {
    expect(
      classifyAgentPluginUpdateCheck(report([summary({ id: "a" }), summary({ id: "b" })])),
    ).toEqual({ outcome: { kind: "current" }, fromCache: false });
  });

  test("keeps plugins without a repository out of the incomplete count", () => {
    // A plugin with no `repository` reports no error and no release metadata.
    expect(
      classifyAgentPluginUpdateCheck(
        report([summary({ id: "a", latest_version: null, error: null })], { checked: 0 }),
      ),
    ).toEqual({ outcome: { kind: "current" }, fromCache: false });
  });

  test("never claims plugins are current when a release lookup failed", () => {
    expect(
      classifyAgentPluginUpdateCheck(
        report(
          [summary({ id: "a" }), summary({ id: "b", latest_version: null, ...UNREADABLE_RELEASE })],
          { status: "partial" },
        ),
      ),
    ).toEqual({
      outcome: {
        kind: "incomplete",
        failures: [{ id: "b", kind: "release_unavailable", message: UNREADABLE_RELEASE.error }],
      },
      fromCache: false,
    });
  });

  test("prefers the available-update count over failed lookups", () => {
    // The failing plugin travels with the count, so the surface can name the
    // package and the reason instead of only saying how many failed.
    expect(
      classifyAgentPluginUpdateCheck(
        report(
          [
            summary({ id: "a", update_available: true, latest_version: "2.0.0" }),
            summary({ id: "b", latest_version: null, ...UNREADABLE_RELEASE }),
          ],
          { status: "partial" },
        ),
      ),
    ).toEqual({
      outcome: {
        kind: "available",
        count: 1,
        failures: [{ id: "b", kind: "release_unavailable", message: UNREADABLE_RELEASE.error }],
      },
      fromCache: false,
    });
  });

  test("states every unreadable release in the language the user reads", () => {
    const kinds: AgentPluginUpdateErrorKind[] = [
      "rate_limited",
      "network_failed",
      "repository_unsupported",
      "release_unavailable",
    ];
    for (const kind of kinds) {
      const key = agentPluginUpdateErrorKey(kind);
      expect(key).not.toBeNull();
      // A reason without text in either locale would render as an empty
      // parenthesis in the update summary.
      expect(zh[key!].trim()).not.toBe("");
      expect(en[key!].trim()).not.toBe("");
    }
    // A row with no classified reason keeps its raw diagnostic.
    expect(agentPluginUpdateErrorKey(null)).toBeNull();
  });

  test("names an exhausted quota instead of counting broken plugins", () => {
    // Every plugin failed, but the reason belongs to the machine's shared
    // anonymous quota rather than to any installed package.
    const exhausted = summary({
      id: "a",
      latest_version: null,
      error: "GitHub rate limit reached (anonymous requests allow 60 per hour per IP address)",
      error_kind: "rate_limited",
    });
    expect(
      classifyAgentPluginUpdateCheck(
        report([exhausted, { ...exhausted, id: "b" }], {
          status: "rate_limited",
          rate_limit_reset: 1_800_000_000,
        }),
      ),
    ).toEqual({
      outcome: {
        kind: "rate_limited",
        count: 2,
        resetAt: 1_800_000_000,
      },
      fromCache: false,
    });
  });

  test("reports a transport failure as a machine condition", () => {
    expect(
      classifyAgentPluginUpdateCheck(
        report(
          [
            summary({
              id: "a",
              latest_version: null,
              error: "GitHub update check failed: error sending request",
              error_kind: "network_failed",
            }),
          ],
          { status: "network_failed" },
        ),
      ),
    ).toEqual({ outcome: { kind: "network_failed", count: 1 }, fromCache: false });
  });

  test("trusts the check status over the per-plugin rows", () => {
    // A quota can run out partway through the loop: the remaining plugins never
    // produced an error at all, and the check status is the only place the
    // machine condition survives.
    expect(
      classifyAgentPluginUpdateCheck(
        report([summary({ id: "a", update_available: true, latest_version: "2.0.0" })], {
          status: "rate_limited",
        }),
      ),
    ).toEqual({
      outcome: { kind: "rate_limited", count: 0, resetAt: null },
      fromCache: false,
    });
  });

  test("marks a result that spent no request", () => {
    expect(
      classifyAgentPluginUpdateCheck(report([summary({ id: "a" })], { checked: 2, cached: 2 })),
    ).toEqual({ outcome: { kind: "current" }, fromCache: true });
    // One revalidation means the result is not purely local.
    expect(
      classifyAgentPluginUpdateCheck(report([summary({ id: "a" })], { checked: 2, cached: 1 }))
        .fromCache,
    ).toBe(false);
    // Nothing was checked at all, so there is no cache result to point at.
    expect(
      classifyAgentPluginUpdateCheck(report([summary({ id: "a" })], { checked: 0, cached: 0 }))
        .fromCache,
    ).toBe(false);
  });

  test("treats a failed command as its own outcome", () => {
    expect(classifyAgentPluginUpdateCheck(null)).toEqual({
      outcome: { kind: "failed" },
      fromCache: false,
    });
    expect(classifyAgentPluginUpdateCheck(report([]))).toEqual({
      outcome: { kind: "current" },
      fromCache: false,
    });
  });
});

describe("Agent Plugin update check coalescing", () => {
  test("shares one run between concurrent callers", async () => {
    let runs = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = async () => {
      runs += 1;
      await gate;
      return report([summary({ id: "a" })]);
    };

    const first = coalesceAgentPluginUpdateCheck(run);
    const second = coalesceAgentPluginUpdateCheck(run);
    release();
    await Promise.all([first, second]);

    expect(runs).toBe(1);
  });

  test("starts a new run once the previous one settled", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return report([summary({ id: "a" })]);
    };

    await coalesceAgentPluginUpdateCheck(run);
    await coalesceAgentPluginUpdateCheck(run);

    expect(runs).toBe(2);
  });

  test("does not keep a failed run in flight", async () => {
    // A rejected check must be retryable rather than replaying its failure.
    await expect(
      coalesceAgentPluginUpdateCheck(() => Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");

    const recovered = await coalesceAgentPluginUpdateCheck(async () =>
      report([summary({ id: "a" })]),
    );
    expect(recovered.updates).toHaveLength(1);
  });
});

describe("Agent Plugin update notifications", () => {
  test("announces one available release once", () => {
    const updates = [summary({ id: "a", update_available: true, latest_version: "2.0.0" })];
    expect(shouldNotifyAgentPluginUpdates(updates)).toBe(true);
    expect(shouldNotifyAgentPluginUpdates(updates)).toBe(false);
    // A current result clears the remembered announcement for a future check.
    expect(shouldNotifyAgentPluginUpdates([summary({ id: "a" })])).toBe(false);
    expect(shouldNotifyAgentPluginUpdates(updates)).toBe(true);
  });

  test("announces a newly discovered release version", () => {
    shouldNotifyAgentPluginUpdates([summary({ id: "a" })]);
    expect(
      shouldNotifyAgentPluginUpdates([
        summary({ id: "a", update_available: true, latest_version: "2.0.0" }),
      ]),
    ).toBe(true);
    expect(
      shouldNotifyAgentPluginUpdates([
        summary({ id: "a", update_available: true, latest_version: "2.1.0" }),
      ]),
    ).toBe(true);
  });
});
