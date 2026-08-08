// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  checkpointFlowProgress,
  checkpointGraphLayers,
  normalizeCheckpointFlow,
} from "../src/lib/checkpointFlow";
import { buildTreeFromCheckpoints, getActiveTipNode } from "../src/lib/checkpointTree";

const checkpoint = (id: string, parent: string | null, flow: unknown) => ({
  meta: {
    checkpoint_id: id,
    conv_id: "conversation",
    parent_checkpoint_id: parent,
    branch_id: "branch",
    created_at: id === "first" ? 1 : 2,
    metadata: "{}",
  },
  data: {
    messages: [],
    file_change_ids: [],
    phase: "final_completed",
    flow,
  },
});

describe("checkpoint Goal and Graph state", () => {
  test("normalizes Goal to-dos and computes progress", () => {
    const flow = normalizeCheckpointFlow("goal", {
      objective: "Ship the panel",
      iteration: 2,
      status: "running",
      todos: [
        { id: "one", task: "Inspect", status: "completed" },
        { id: "two", task: "Implement", status: "in_progress" },
      ],
    });

    expect(flow?.kind).toBe("goal");
    expect(flow && checkpointFlowProgress(flow)).toEqual({ completed: 1, total: 2 });
  });

  test("preserves Graph dependencies while rejecting malformed nodes", () => {
    const flow = normalizeCheckpointFlow("graph", {
      objective: "Run in parallel",
      status: "blocked",
      nodes: [
        { id: "root", task: "Start", depends_on: [], status: "completed" },
        { id: "leaf", task: "Finish", depends_on: ["root", 42], status: "blocked" },
        { id: 3, task: "Ignored", status: "running" },
      ],
    });

    expect(flow).toMatchObject({
      kind: "graph",
      status: "blocked",
      nodes: [
        { id: "root", dependsOn: [], status: "completed" },
        { id: "leaf", dependsOn: ["root"], status: "blocked" },
      ],
    });
  });

  test("exposes flow state from the selected durable branch tip", () => {
    const tree = buildTreeFromCheckpoints([
      checkpoint("first", null, {
        kind: "goal",
        state: { objective: "First", status: "running", todos: [] },
      }),
      checkpoint("second", "first", {
        kind: "goal",
        state: {
          objective: "First",
          status: "completed",
          todos: [{ id: "done", task: "Done", status: "completed" }],
        },
      }),
    ]);

    expect(getActiveTipNode(tree)?.ckId).toBe("second");
    expect(getActiveTipNode(tree)?.flow?.status).toBe("completed");
  });
});

const graphNode = (id: string, dependsOn: string[] = []) => ({
  id,
  task: id,
  dependsOn,
  status: "running" as const,
});

describe("checkpoint graph layout", () => {
  test("places parallel branches together before their convergence", () => {
    const layers = checkpointGraphLayers([
      graphNode("inspect"),
      graphNode("frontend", ["inspect"]),
      graphNode("docs", ["inspect"]),
      graphNode("verify", ["frontend", "docs"]),
    ]);

    expect(layers.map((layer) => layer.map(({ id }) => id))).toEqual([
      ["inspect"],
      ["frontend", "docs"],
      ["verify"],
    ]);
  });

  test("keeps unknown dependencies and malformed cycles visible", () => {
    const layers = checkpointGraphLayers([
      graphNode("root", ["missing"]),
      graphNode("cycle-a", ["cycle-b"]),
      graphNode("cycle-b", ["cycle-a"]),
    ]);

    expect(layers.flat().map(({ id }) => id)).toEqual(["root", "cycle-a", "cycle-b"]);
  });
});
