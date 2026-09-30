import type { AgentPluginUpdateReport, AgentPluginUpdateSummary } from "$lib/types";

/**
 * What an explicit Agent Plugin update check found.
 *
 * `failed` is the whole command failing. The three machine conditions are
 * distinct from `incomplete` because they describe this machine's access to
 * GitHub rather than any plugin: an anonymous request quota is shared with all
 * other traffic on the same address, so a check can fail wholesale while every
 * installed plugin is healthy. Reporting that as "plugins failed to update"
 * tells the user to repair something that is not broken.
 *
 * `available` and `incomplete` are kept apart from `current` so a network
 * failure can never be reported to the user as "everything is up to date".
 */
export type AgentPluginUpdateCheckOutcome =
  | { kind: "failed" }
  | { kind: "rate_limited"; count: number; resetAt: number | null; tokenConfigured: boolean }
  | { kind: "unauthorized"; count: number }
  | { kind: "network_failed"; count: number }
  | { kind: "available"; count: number; incomplete: number }
  | { kind: "incomplete"; count: number }
  | { kind: "current" };

export interface AgentPluginUpdateCheckResult {
  outcome: AgentPluginUpdateCheckOutcome;
  /**
   * Every plugin examined was answered from the local cache, so this result
   * spent no request and may predate the user's click.
   */
  fromCache: boolean;
}

function countByKind(
  updates: AgentPluginUpdateSummary[],
  kind: AgentPluginUpdateSummary["error_kind"],
): number {
  return updates.filter((update) => update.error_kind === kind).length;
}

/**
 * Classify a `check_agent_plugin_updates` report for user-facing feedback.
 * Pass `null` when the command itself could not be completed.
 *
 * The check's own status decides a machine condition rather than re-deriving it
 * from per-plugin errors: a quota can run out partway through the loop, so the
 * per-plugin rows alone cannot tell whether GitHub was reachable.
 */
export function classifyAgentPluginUpdateCheck(
  report: AgentPluginUpdateReport | null,
): AgentPluginUpdateCheckResult {
  if (!report) return { outcome: { kind: "failed" }, fromCache: false };
  const { updates, check } = report;
  const fromCache = check.checked > 0 && check.cached === check.checked;
  const classified = (outcome: AgentPluginUpdateCheckOutcome) => ({ outcome, fromCache });

  if (check.status === "unauthorized") {
    return classified({ kind: "unauthorized", count: countByKind(updates, "unauthorized") });
  }
  if (check.status === "rate_limited") {
    return classified({
      kind: "rate_limited",
      count: countByKind(updates, "rate_limited"),
      resetAt: check.rate_limit_reset,
      tokenConfigured: check.token_configured,
    });
  }
  if (check.status === "network_failed") {
    return classified({ kind: "network_failed", count: countByKind(updates, "network_failed") });
  }

  const available = updates.filter((update) => update.update_available).length;
  const incomplete = updates.filter((update) => update.error).length;
  if (available > 0) {
    return classified({ kind: "available", count: available, incomplete });
  }
  if (incomplete > 0) return classified({ kind: "incomplete", count: incomplete });
  return classified({ kind: "current" });
}

let inFlight: Promise<AgentPluginUpdateReport> | null = null;

/**
 * Share one update check between every trigger that wants one.
 *
 * Startup, the settings surface, and the plugin-change listener can all ask at
 * once, and the check spends a rate-limited quota. Callers that arrive while a
 * check is running receive its result instead of starting a second round.
 */
export function coalesceAgentPluginUpdateCheck(
  run: () => Promise<AgentPluginUpdateReport>,
): Promise<AgentPluginUpdateReport> {
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
