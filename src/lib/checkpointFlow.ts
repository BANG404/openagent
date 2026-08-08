export type CheckpointFlowStatus = "running" | "completed" | "failed" | "blocked";

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
  status: CheckpointFlowStatus;
  result?: string;
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
    };

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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function iteration(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function normalizeCheckpointFlow(
  kind: "goal" | "graph",
  value: unknown,
): CheckpointFlow | undefined {
  const state = asRecord(value);
  if (!state || typeof state.objective !== "string") return undefined;
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
      kind,
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
            status: flowStatus(node.status),
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
  return { kind, ...common, nodes };
}

export function checkpointFlowProgress(flow: CheckpointFlow): { completed: number; total: number } {
  const items = flow.kind === "goal" ? flow.todos : flow.nodes;
  return {
    completed: items.filter((item) => item.status === "completed").length,
    total: items.length,
  };
}
