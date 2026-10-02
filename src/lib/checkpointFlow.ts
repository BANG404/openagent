import type { PluginFlowUpdatedEvent } from "./types";

/** Status values the host understands for common progress presentation. */
export type CheckpointFlowStatus = "running" | "completed" | "failed" | "blocked";

/** One package-owned entry in the optional common progress projection. */
export interface CheckpointFlowItem {
  id: string;
  label: string;
  /** The package chooses this vocabulary and the host preserves unknown values. */
  status: string;
  detail?: string;
}

/**
 * The host only renders a package projection. It does not know whether the
 * package is a planner, graph runner, group, or another long-lived feature.
 */
export interface CheckpointFlow {
  kind: "plugin";
  objective: string;
  /** The package's own status string, carried through unchanged. */
  status: string;
  /** Namespaced package flow id, when the package supplied one. */
  flowId: string;
  /** Authenticated package id, when present in the projection. */
  pluginId?: string;
  items: CheckpointFlowItem[];
  summary?: string;
}

export interface LiveCheckpointFlowProjection {
  flow: CheckpointFlow;
  version: number;
}

export interface LiveCheckpointRefreshGuard {
  refreshVersion: number;
  branchSelectionVersion: number;
  flowVersion: number;
}

export interface LiveCheckpointRefreshDecision {
  applyDurableTip: boolean;
  clearLiveProjection: boolean;
}

/**
 * Decide whether an asynchronous durable refresh still owns the branch it
 * started for. A newer refresh supersedes the old one; a branch switch makes
 * its selected tip stale; and a newer live package event must remain on top of
 * the durable snapshot that the refresh read.
 */
export function liveCheckpointRefreshDecision(
  captured: LiveCheckpointRefreshGuard,
  current: LiveCheckpointRefreshGuard,
): LiveCheckpointRefreshDecision {
  if (
    captured.refreshVersion !== current.refreshVersion ||
    captured.branchSelectionVersion !== current.branchSelectionVersion
  ) {
    return { applyDurableTip: false, clearLiveProjection: false };
  }
  return {
    applyDurableTip: true,
    clearLiveProjection: captured.flowVersion === current.flowVersion,
  };
}

export function conversationDetailsAvailable(
  flow: CheckpointFlow | null | undefined,
  fileChangeCount: number,
): boolean {
  return Boolean(flow || fileChangeCount > 0);
}

export function checkpointFlowPanelKey(
  conversationId: string | null,
  branchId: string | null,
  flow: CheckpointFlow | null | undefined,
): string | null {
  if (!conversationId || !flow) return null;
  return `${conversationId}\u0000${branchId ?? ""}\u0000${flow.flowId}\u0000${flow.objective}`;
}

export function shouldAutoOpenCheckpointFlowPanel(
  previous: CheckpointFlow | null | undefined,
  next: CheckpointFlow,
): boolean {
  if (!previous) return true;
  if (
    previous.flowId !== next.flowId ||
    previous.objective !== next.objective ||
    previous.pluginId !== next.pluginId
  ) {
    return true;
  }
  return previous.status !== "running" && next.status === "running";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function packageStatus(value: unknown): string {
  return optionalString(value) ?? "running";
}

function flowItem(value: unknown): CheckpointFlowItem | undefined {
  const item = asRecord(value);
  if (!item || typeof item.id !== "string") return undefined;
  const label = optionalString(item.label) ?? optionalString(item.task);
  if (!label) return undefined;
  return {
    id: item.id,
    label,
    status: packageStatus(item.status),
    detail: optionalString(item.detail) ?? optionalString(item.result),
  };
}

function itemsFromState(state: Record<string, unknown>): CheckpointFlowItem[] {
  if (!Array.isArray(state.items)) return [];
  return state.items.flatMap((value): CheckpointFlowItem[] => {
    const item = flowItem(value);
    return item ? [item] : [];
  });
}

function legacyItems(kind: string, state: Record<string, unknown>): CheckpointFlowItem[] {
  const source = kind === "goal" ? state.todos : kind === "graph" ? state.nodes : undefined;
  if (!Array.isArray(source)) return [];
  return source.flatMap((value): CheckpointFlowItem[] => {
    const item = flowItem(value);
    if (!item) return [];
    // Legacy graph dependencies remain readable as text in the generic list;
    // no host DAG, reducer, or edge model is created from them.
    if (kind === "graph") {
      const record = asRecord(value);
      const dependencies = Array.isArray(record?.depends_on)
        ? record.depends_on.filter(
            (dependency): dependency is string => typeof dependency === "string",
          )
        : [];
      if (dependencies.length > 0 && !item.detail) {
        return [{ ...item, detail: `Depends on: ${dependencies.join(", ")}` }];
      }
    }
    return [item];
  });
}

/**
 * Normalize a checkpoint projection into the one host shape. New package
 * projections use `kind: "plugin"`; `goal` and `graph` are read-only legacy
 * payloads and are flattened without applying their old domain semantics.
 */
export function normalizeCheckpointFlow(kind: string, value: unknown): CheckpointFlow | undefined {
  const state = asRecord(value);
  if (!state) return undefined;
  const pluginId = optionalString(state.plugin_id);
  const flowId =
    optionalString(state.flow_id) ??
    (pluginId ? `plugin:${pluginId}` : kind === "plugin" ? "plugin" : `legacy:${kind}`);
  const objective = optionalString(state.title) ?? optionalString(state.objective);
  if (!objective) return undefined;
  const summary = optionalString(state.summary);
  return {
    kind: "plugin",
    objective,
    status: packageStatus(state.status),
    flowId,
    pluginId,
    items: kind === "plugin" ? itemsFromState(state) : legacyItems(kind, state),
    summary,
  };
}

export function checkpointFlowFromLiveUpdate(
  update: PluginFlowUpdatedEvent,
): CheckpointFlow | undefined {
  return update.flow ? normalizeCheckpointFlow(update.flow.kind, update.flow.state) : undefined;
}

export function updateLiveCheckpointFlowProjection(
  previous: LiveCheckpointFlowProjection | undefined,
  update: PluginFlowUpdatedEvent,
): LiveCheckpointFlowProjection | undefined {
  const flow = checkpointFlowFromLiveUpdate(update);
  return flow ? { flow, version: (previous?.version ?? 0) + 1 } : previous;
}

export function checkpointFlowProgress(flow: CheckpointFlow): { completed: number; total: number } {
  return {
    completed: flow.items.filter((item) => item.status === "completed").length,
    total: flow.items.length,
  };
}
