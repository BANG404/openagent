// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  checkpointFlowFromLiveUpdate,
  checkpointFlowProgress,
  checkpointGraphLayers,
  normalizeCheckpointFlow,
  updateLiveCheckpointFlowProjection,
} from "../src/lib/checkpointFlow";
import {
  attachNewTurn,
  buildTreeFromCheckpoints,
  getActiveTipNode,
  reconcileLiveCheckpointTip,
} from "../src/lib/checkpointTree";

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

  test("advances live Goal state before the streamed turn finalizes", () => {
    const first = checkpoint("first", null, {
      kind: "goal",
      state: {
        objective: "Ship live state",
        status: "running",
        todos: [{ id: "inspect", task: "Inspect", status: "in_progress" }],
      },
    });
    const tree = buildTreeFromCheckpoints([first]);
    const second = checkpoint("second", "first", {
      kind: "goal",
      state: {
        objective: "Ship live state",
        status: "running",
        todos: [
          { id: "inspect", task: "Inspect", status: "completed" },
          { id: "fix", task: "Fix", status: "in_progress" },
        ],
      },
    });

    const refreshed = reconcileLiveCheckpointTip([first, second], tree, "second");

    expect(getActiveTipNode(refreshed)?.ckId).toBe("second");
    expect(getActiveTipNode(refreshed)?.flow).toMatchObject({
      status: "running",
      todos: [
        { id: "inspect", status: "completed" },
        { id: "fix", status: "in_progress" },
      ],
    });
  });

  test("keeps live checkpoint flow data when stream finalization sees the same tip", () => {
    const tree = reconcileLiveCheckpointTip(
      [
        checkpoint("live", null, {
          kind: "graph",
          state: {
            objective: "Keep the graph",
            status: "running",
            nodes: [{ id: "work", task: "Work", status: "running" }],
          },
        }),
      ],
      undefined,
      "live",
    );

    const finalized = attachNewTurn(
      tree,
      "live",
      { id: "user", role: "user", content: "go", timestamp: 1 },
      { id: "assistant", role: "assistant", content: "done", timestamp: 2 },
      undefined,
    ).tree;

    expect(getActiveTipNode(finalized)?.flow).toMatchObject({
      kind: "graph",
      status: "running",
      nodes: [{ id: "work", status: "running" }],
    });
  });

  test("normalizes the complete transient Goal snapshot emitted by a tool update", () => {
    const flow = checkpointFlowFromLiveUpdate({
      conv_id: "conversation",
      kind: "goal",
      status: "running",
      flow: {
        kind: "goal",
        state: {
          objective: "Show progress now",
          status: "running",
          iteration: 1,
          todos: [
            { id: "inspect", task: "Inspect", status: "completed" },
            { id: "fix", task: "Fix", status: "in_progress" },
          ],
        },
      },
    });

    expect(flow).toMatchObject({
      kind: "goal",
      objective: "Show progress now",
      todos: [
        { id: "inspect", status: "completed" },
        { id: "fix", status: "in_progress" },
      ],
    });
  });

  test("does not mistake a legacy status-only event for live flow authority", () => {
    expect(
      checkpointFlowFromLiveUpdate({
        conv_id: "conversation",
        kind: "goal",
        status: "running",
      }),
    ).toBeUndefined();
  });

  test("versions live projections so an older durable refresh cannot clear a newer update", () => {
    const first = updateLiveCheckpointFlowProjection(undefined, {
      conv_id: "conversation",
      kind: "goal",
      status: "running",
      flow: {
        kind: "goal",
        state: { objective: "Live", status: "running", todos: [] },
      },
    });
    const second = updateLiveCheckpointFlowProjection(first, {
      conv_id: "conversation",
      kind: "goal",
      status: "running",
      flow: {
        kind: "goal",
        state: {
          objective: "Live",
          status: "running",
          todos: [{ id: "next", task: "Next", status: "in_progress" }],
        },
      },
    });

    expect(second?.version).toBe(2);
    expect(second?.flow).toMatchObject({ todos: [{ id: "next", status: "in_progress" }] });
    expect(
      updateLiveCheckpointFlowProjection(second, {
        conv_id: "conversation",
        kind: "goal",
        status: "running",
      }),
    ).toBe(second);
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
