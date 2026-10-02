import type { PluginFlowUpdatedEvent } from "./types";

export type CheckpointFlowStatus = "running" | "completed" | "failed" | "blocked";
export type CheckpointGraphNodeStatus = CheckpointFlowStatus | "pending";

export interface CheckpointGoalTodo {
  id: string;
  task: string;
  status: "pending" | "in_progress" | "completed";
  result?: string;
}

export interface CheckpointGraphNode {
  id: string;
  task: string;
  dependsOn: string[];
  status: CheckpointGraphNodeStatus;
  result?: string;
}

/** One flat entry of a package flow's own progress projection. */
export interface CheckpointFlowItem {
  id: string;
  label: string;
  /** Package-owned vocabulary; only the tokens the host also uses get a label. */
  status: string;
  detail?: string;
}

export type CheckpointFlow =
  | {
      kind: "goal";
      objective: string;
      status: CheckpointFlowStatus;
      iteration: number;
      todos: CheckpointGoalTodo[];
      summary?: string;
      graphNodeId?: string;
    }
  | {
      kind: "graph";
      objective: string;
      status: CheckpointFlowStatus;
      iteration: number;
      nodes: CheckpointGraphNode[];
      summary?: string;
    }
  | {
      kind: "plugin";
      objective: string;
      /** The package's own status string, carried to the panel unchanged. */
      status: string;
      /** Namespaced catalog id, the key that names the flow for the reader. */
      flowId: string;
      items: CheckpointFlowItem[];
      summary?: string;
    };

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
  return `${conversationId}\u0000${branchId ?? ""}\u0000${flow.kind}\u0000${flow.objective}`;
}

export function shouldAutoOpenCheckpointFlowPanel(
  previous: CheckpointFlow | null | undefined,
  next: CheckpointFlow,
): boolean {
  if (!previous) return true;
  if (previous.kind !== next.kind || previous.objective !== next.objective) return true;
  return previous.status !== "running" && next.status === "running";
}

const flowStatuses = new Set<CheckpointFlowStatus>(["running", "completed", "failed", "blocked"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function flowStatus(value: unknown): CheckpointFlowStatus {
  return typeof value === "string" && flowStatuses.has(value as CheckpointFlowStatus)
    ? (value as CheckpointFlowStatus)
    : "running";
}

function graphNodeStatus(value: unknown, started: unknown): CheckpointGraphNodeStatus {
  const status = flowStatus(value);
  return status === "running" && started === false ? "pending" : status;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function iteration(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function flowItem(value: unknown): CheckpointFlowItem | undefined {
  const item = asRecord(value);
  if (!item || typeof item.id !== "string" || typeof item.label !== "string") return undefined;
  return {
    id: item.id,
    label: item.label,
    status: typeof item.status === "string" ? item.status : "running",
    detail: optionalString(item.detail),
  };
}

/**
 * A package flow reports its own projection, so nothing here is interpreted:
 * the title is the reader-facing heading and every item keeps the status string
 * the package chose.
 */
function pluginFlow(state: Record<string, unknown>): CheckpointFlow | undefined {
  const title = optionalString(state.title) ?? optionalString(state.objective);
  if (!title) return undefined;
  return {
    kind: "plugin",
    objective: title,
    status: optionalString(state.status) ?? "running",
    flowId: optionalString(state.flow_id) ?? "",
    items: Array.isArray(state.items)
      ? state.items.flatMap((value): CheckpointFlowItem[] => {
          const item = flowItem(value);
          return item ? [item] : [];
        })
      : [],
    summary: optionalString(state.summary),
  };
}

export function normalizeCheckpointFlow(kind: string, value: unknown): CheckpointFlow | undefined {
  const state = asRecord(value);
  if (!state) return undefined;
  if (kind === "plugin") return pluginFlow(state);
  if (typeof state.objective !== "string") return undefined;
  const common = {
    objective: state.objective,
    status: flowStatus(state.status),
    iteration: iteration(state.iteration),
    summary: optionalString(state.summary),
  };

  if (kind === "goal") {
    const todos = Array.isArray(state.todos)
      ? state.todos.flatMap((value): CheckpointGoalTodo[] => {
          const todo = asRecord(value);
          if (!todo || typeof todo.id !== "string" || typeof todo.task !== "string") return [];
          const status =
            todo.status === "in_progress" || todo.status === "completed" ? todo.status : "pending";
          return [
            {
              id: todo.id,
              task: todo.task,
              status,
              result: optionalString(todo.result),
            },
          ];
        })
      : [];
    return {
      kind: "goal",
      ...common,
      todos,
      graphNodeId: optionalString(state.graph_node_id),
    };
  }

  const nodes = Array.isArray(state.nodes)
    ? state.nodes.flatMap((value): CheckpointGraphNode[] => {
        const node = asRecord(value);
        if (!node || typeof node.id !== "string" || typeof node.task !== "string") return [];
        return [
          {
            id: node.id,
            task: node.task,
            status: graphNodeStatus(node.status, node.started),
            dependsOn: Array.isArray(node.depends_on)
              ? node.depends_on.filter(
                  (dependency): dependency is string => typeof dependency === "string",
                )
              : [],
            result: optionalString(node.result),
          },
        ];
      })
    : [];
  return { kind: "graph", ...common, nodes };
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
  const items = flow.kind === "goal" ? flow.todos : flow.kind === "graph" ? flow.nodes : flow.items;
  return {
    completed: items.filter((item) => item.status === "completed").length,
    total: items.length,
  };
}

export function checkpointGraphLayers(nodes: CheckpointGraphNode[]): CheckpointGraphNode[][] {
  // NOSONAR: graph layering handles malformed and sparse checkpoint data in one pass.
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const node of nodes) {
    const dependencies = new Set(
      node.dependsOn.filter((dependency) => dependency !== node.id && nodeById.has(dependency)),
    );
    indegree.set(node.id, dependencies.size);
    for (const dependency of dependencies) {
      const children = dependents.get(dependency) ?? [];
      children.push(node.id);
      dependents.set(dependency, children);
    }
  }

  const ranks = new Map<string, number>();
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  for (const id of ready) ranks.set(id, 0);
  let cursor = 0;
  while (cursor < ready.length) {
    const id = ready[cursor++];
    const rank = ranks.get(id) ?? 0;
    for (const dependent of dependents.get(id) ?? []) {
      ranks.set(dependent, Math.max(ranks.get(dependent) ?? 0, rank + 1));
      const remaining = (indegree.get(dependent) ?? 1) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  // A valid Graph is acyclic. Keep malformed cyclic checkpoints visible in a
  // final layer instead of dropping their nodes from the status panel.
  const fallbackRank = Math.max(-1, ...ranks.values()) + 1;
  for (const node of nodes) {
    if (!ranks.has(node.id)) ranks.set(node.id, fallbackRank);
  }

  const layers: CheckpointGraphNode[][] = [];
  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const layer = layers[rank] ?? [];
    layer.push(node);
    layers[rank] = layer;
  }
  for (const layer of layers) {
    if (!layer) continue;
    layer.sort((a, b) => (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0));
  }
  return layers.filter((layer) => layer.length > 0);
}
