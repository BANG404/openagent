import type { TranslationKeys } from "$lib/i18n";
import type {
  AgentPluginUpdateErrorKind,
  AgentPluginUpdateReport,
  AgentPluginUpdateSummary,
} from "$lib/types";

/**
 * One plugin whose release metadata could not be read.
 *
 * The summary line names these instead of only counting them: a count cannot
 * tell an unpublished local package apart from a GitHub outage, and naming the
 * package is what makes the condition actionable.
 */
export interface AgentPluginUpdateFailure {
  id: string;
  kind: AgentPluginUpdateErrorKind | null;
  /** The raw diagnostic, shown as the detail behind the localized reason. */
  message: string;
}

const updateErrorKeys: Record<AgentPluginUpdateErrorKind, TranslationKeys> = {
  release_unavailable: "pluginUpdateErrorReleaseUnavailable",
  repository_unsupported: "pluginUpdateErrorRepositoryUnsupported",
  rate_limited: "pluginUpdateErrorRateLimited",
  network_failed: "pluginUpdateErrorNetworkFailed",
};

/**
 * The localized statement of why one release lookup failed, or `null` when the
 * plugin reported no reason at all.
 */
export function agentPluginUpdateErrorKey(
  kind: AgentPluginUpdateErrorKind | null,
): TranslationKeys | null {
  return kind === null ? null : updateErrorKeys[kind];
}

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
  | { kind: "rate_limited"; count: number; resetAt: number | null }
  | { kind: "network_failed"; count: number }
  | { kind: "available"; count: number; failures: AgentPluginUpdateFailure[] }
  | { kind: "incomplete"; failures: AgentPluginUpdateFailure[] }
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

/** A plugin row that reported an error, or `null` when it produced metadata. */
function failureOf(update: AgentPluginUpdateSummary): AgentPluginUpdateFailure | null {
  return update.error === null
    ? null
    : { id: update.id, kind: update.error_kind, message: update.error };
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

  if (check.status === "rate_limited") {
    return classified({
      kind: "rate_limited",
      count: countByKind(updates, "rate_limited"),
      resetAt: check.rate_limit_reset,
    });
  }
  if (check.status === "network_failed") {
    return classified({ kind: "network_failed", count: countByKind(updates, "network_failed") });
  }

  const available = updates.filter((update) => update.update_available).length;
  const failures = updates
    .map(failureOf)
    .filter((failure): failure is AgentPluginUpdateFailure => failure !== null);
  if (available > 0) {
    return classified({ kind: "available", count: available, failures });
  }
  if (failures.length > 0) return classified({ kind: "incomplete", failures });
  return classified({ kind: "current" });
}

let inFlight: Promise<AgentPluginUpdateReport> | null = null;
let lastNotifiedPluginUpdateKey: string | null = null;

/**
 * Prevent multiple UI triggers from announcing the same available release.
 *
 * Startup and lifecycle events can both consume one shared check result. The
 * request is coalesced, but each caller still gets the result and could show
 * the same toast. A versioned set keeps the announcement idempotent while
 * still allowing a later release (or a newly discovered plugin) to notify.
 */
export function shouldNotifyAgentPluginUpdates(updates: AgentPluginUpdateSummary[]): boolean {
  const available = updates
    .filter((update) => update.update_available)
    .map((update) => `${update.id}\u0000${update.latest_version ?? ""}`)
    .sort();
  if (available.length === 0) {
    lastNotifiedPluginUpdateKey = null;
    return false;
  }

  const key = available.join("\u0001");
  if (key === lastNotifiedPluginUpdateKey) return false;
  lastNotifiedPluginUpdateKey = key;
  return true;
}

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
