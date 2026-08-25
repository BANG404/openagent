// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  checkpointFlowPanelKey,
  shouldAutoOpenCheckpointFlowPanel,
} from "../src/lib/checkpointFlow";

const goal = (status = "running") => ({
  kind: "goal",
  objective: "Ship the change",
  status,
  iteration: 1,
  todos: [],
});

describe("checkpoint flow panel state", () => {
  test("opens for a newly created flow and a restarted terminal flow", () => {
    expect(shouldAutoOpenCheckpointFlowPanel(undefined, goal())).toBe(true);
    expect(shouldAutoOpenCheckpointFlowPanel(goal("completed"), goal())).toBe(true);
  });

  test("preserves the user's choice during updates to the same running flow", () => {
    expect(shouldAutoOpenCheckpointFlowPanel(goal(), { ...goal(), iteration: 2 })).toBe(false);
  });

  test("keys panel selection by conversation and branch", () => {
    expect(checkpointFlowPanelKey("conv", "branch-a", goal())).not.toBe(
      checkpointFlowPanelKey("conv", "branch-b", goal()),
    );
    expect(checkpointFlowPanelKey(null, null, goal())).toBeNull();
  });
});
