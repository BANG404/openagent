// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import {
  checkpointFlowFromLiveUpdate,
  conversationDetailsAvailable,
  checkpointFlowProgress,
  liveCheckpointRefreshDecision,
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

describe("checkpoint package flow state", () => {
  test("shows a package flow in every durable status", () => {
    for (const status of ["running", "completed", "failed", "blocked"]) {
      expect(
        conversationDetailsAvailable(
          { kind: "plugin", objective: "Package", flowId: "plugin:demo:run", items: [], status },
          0,
        ),
      ).toBe(true);
    }
  });

  test("hides only details without a flow or file changes", () => {
    expect(conversationDetailsAvailable(undefined, 0)).toBe(false);
    expect(conversationDetailsAvailable(null, 0)).toBe(false);
    expect(conversationDetailsAvailable(undefined, 1)).toBe(true);
  });

  test("normalizes a legacy Goal projection into the common package shape", () => {
    const flow = normalizeCheckpointFlow("goal", {
      objective: "Ship the panel",
      iteration: 2,
      status: "running",
      todos: [
        { id: "one", task: "Inspect", status: "completed" },
        { id: "two", task: "Implement", status: "in_progress" },
      ],
    });

    expect(flow).toMatchObject({
      kind: "plugin",
      objective: "Ship the panel",
      status: "running",
      items: [
        { id: "one", label: "Inspect", status: "completed" },
        { id: "two", label: "Implement", status: "in_progress" },
      ],
    });
    expect(flow && checkpointFlowProgress(flow)).toEqual({ completed: 1, total: 2 });
  });

  test("carries a package flow's own title, status, and items unchanged", () => {
    const flow = normalizeCheckpointFlow("plugin", {
      plugin_id: "goal",
      flow_id: "plugin:goal:goal",
      title: "Ship the release",
      status: "awaiting_review",
      items: [
        { id: "one", label: "Inspect", status: "completed" },
        { id: "two", label: "Implement", status: "in_progress", detail: "editing files" },
        { id: 3, label: "Ignored", status: "pending" },
      ],
      summary: "One of two",
    });

    expect(flow).toEqual({
      kind: "plugin",
      objective: "Ship the release",
      status: "awaiting_review",
      flowId: "plugin:goal:goal",
      pluginId: "goal",
      items: [
        { id: "one", label: "Inspect", status: "completed", detail: undefined },
        { id: "two", label: "Implement", status: "in_progress", detail: "editing files" },
      ],
      summary: "One of two",
    });
    expect(flow && checkpointFlowProgress(flow)).toEqual({ completed: 1, total: 2 });
    expect(
      checkpointFlowFromLiveUpdate({
        conv_id: "conversation",
        kind: "plugin-flow",
        status: "running",
        flow: {
          kind: "plugin",
          state: {
            plugin_id: "goal",
            flow_id: "plugin:goal:goal",
            title: "Ship the release",
            status: "running",
            items: [],
          },
        },
      }),
    ).toMatchObject({ kind: "plugin", objective: "Ship the release" });
  });

  test("rejects a package projection without a title", () => {
    expect(normalizeCheckpointFlow("plugin", { items: [] })).toBeUndefined();
  });

  test("flattens a legacy Graph projection without creating a host DAG", () => {
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
      kind: "plugin",
      objective: "Run in parallel",
      status: "blocked",
      items: [
        { id: "root", label: "Start", status: "completed" },
        { id: "leaf", label: "Finish", status: "blocked", detail: "Depends on: root" },
      ],
    });
  });

  test("preserves legacy Graph status vocabulary as ordinary package items", () => {
    const flow = normalizeCheckpointFlow("graph", {
      objective: "Run in order",
      status: "running",
      nodes: [
        { id: "active", task: "Active", status: "running", started: true },
        { id: "waiting", task: "Waiting", status: "running", started: false },
        { id: "legacy", task: "Legacy", status: "running" },
        { id: "done", task: "Done", status: "completed", started: false },
      ],
    });

    expect(flow).toMatchObject({
      kind: "plugin",
      items: [
        { id: "active", label: "Active", status: "running" },
        { id: "waiting", label: "Waiting", status: "running" },
        { id: "legacy", label: "Legacy", status: "running" },
        { id: "done", label: "Done", status: "completed" },
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
      items: [
        { id: "inspect", label: "Inspect", status: "completed" },
        { id: "fix", label: "Fix", status: "in_progress" },
      ],
    });
    expect(getActiveTipNode(refreshed)?.flow).not.toHaveProperty("todos");
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
      kind: "plugin",
      status: "running",
      items: [{ id: "work", label: "Work", status: "running" }],
    });
  });

  test("normalizes a complete transient plugin snapshot emitted by an event", () => {
    const flow = checkpointFlowFromLiveUpdate({
      conv_id: "conversation",
      branch_id: "branch",
      flow_id: "plugin:demo:run",
      status: "running",
      flow: {
        kind: "plugin",
        state: {
          plugin_id: "demo",
          flow_id: "plugin:demo:run",
          title: "Show progress now",
          status: "running",
          items: [
            { id: "inspect", label: "Inspect", status: "completed" },
            { id: "fix", label: "Fix", status: "in_progress" },
          ],
        },
      },
    });

    expect(flow).toMatchObject({
      kind: "plugin",
      objective: "Show progress now",
      items: [
        { id: "inspect", status: "completed" },
        { id: "fix", status: "in_progress" },
      ],
    });
  });

  test("does not mistake a legacy status-only event for live flow authority", () => {
    expect(
      checkpointFlowFromLiveUpdate({
        conv_id: "conversation",
        branch_id: "branch",
        flow_id: "plugin:demo:run",
        status: "running",
      }),
    ).toBeUndefined();
  });

  test("versions live projections so an older durable refresh cannot clear a newer update", () => {
    const first = updateLiveCheckpointFlowProjection(undefined, {
      conv_id: "conversation",
      branch_id: "branch",
      flow_id: "plugin:demo:run",
      status: "running",
      flow: {
        kind: "plugin",
        state: { plugin_id: "demo", flow_id: "plugin:demo:run", title: "Live", status: "running", items: [] },
      },
    });
    const second = updateLiveCheckpointFlowProjection(first, {
      conv_id: "conversation",
      branch_id: "branch",
      flow_id: "plugin:demo:run",
      status: "running",
      flow: {
        kind: "plugin",
        state: {
          plugin_id: "demo",
          flow_id: "plugin:demo:run",
          title: "Live",
          status: "running",
          items: [{ id: "next", label: "Next", status: "in_progress" }],
        },
      },
    });

    expect(second?.version).toBe(2);
    expect(second?.flow).toMatchObject({ items: [{ id: "next", status: "in_progress" }] });
    expect(
      updateLiveCheckpointFlowProjection(second, {
        conv_id: "conversation",
        branch_id: "branch",
        flow_id: "plugin:demo:run",
        status: "running",
      }),
    ).toBe(second);
  });

  test("keeps a newer branch projection above an older durable refresh", () => {
    expect(
      liveCheckpointRefreshDecision(
        { refreshVersion: 1, branchSelectionVersion: 4, flowVersion: 1 },
        { refreshVersion: 1, branchSelectionVersion: 4, flowVersion: 2 },
      ),
    ).toEqual({ applyDurableTip: true, clearLiveProjection: false });
  });

  test("abandons a refresh after a sibling branch is selected", () => {
    expect(
      liveCheckpointRefreshDecision(
        { refreshVersion: 1, branchSelectionVersion: 4, flowVersion: 1 },
        { refreshVersion: 1, branchSelectionVersion: 5, flowVersion: 1 },
      ),
    ).toEqual({ applyDurableTip: false, clearLiveProjection: false });
  });
});
