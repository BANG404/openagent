import type { AgentPluginUpdateSummary } from "$lib/types";

/**
 * What an explicit Agent Plugin update check found.
 *
 * `failed` is the whole command failing, `incomplete` is the command
 * succeeding while some plugins never produced release metadata. Both are
 * kept apart from `current` so a network failure can never be reported to the
 * user as "everything is up to date".
 */
export type AgentPluginUpdateCheckOutcome =
  | { kind: "failed" }
  | { kind: "available"; count: number }
  | { kind: "incomplete"; count: number }
  | { kind: "current" };

/**
 * Classify the result of `check_agent_plugin_updates` for user-facing feedback.
 * Pass `null` when the command itself could not be completed.
 */
export function classifyAgentPluginUpdateCheck(
  updates: AgentPluginUpdateSummary[] | null,
): AgentPluginUpdateCheckOutcome {
  if (!updates) return { kind: "failed" };
  const available = updates.filter((update) => update.update_available).length;
  if (available > 0) return { kind: "available", count: available };
  const incomplete = updates.filter((update) => update.error).length;
  if (incomplete > 0) return { kind: "incomplete", count: incomplete };
  return { kind: "current" };
}
