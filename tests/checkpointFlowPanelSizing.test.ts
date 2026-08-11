// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  CHECKPOINT_FLOW_PANEL_MAX_CONTAINER_RATIO,
  CHECKPOINT_FLOW_PANEL_MAX_WIDTH,
  CHECKPOINT_FLOW_PANEL_MIN_WIDTH,
  checkpointFlowPanelMaximum,
  clampCheckpointFlowPanelWidth,
} from "../src/lib/checkpointFlowPanelSizing";

describe("checkpoint flow panel sizing", () => {
  test("caps the panel against its conversation container instead of the window", () => {
    expect(checkpointFlowPanelMaximum(836)).toBe(836 * CHECKPOINT_FLOW_PANEL_MAX_CONTAINER_RATIO);
    expect(clampCheckpointFlowPanelWidth(520, 836)).toBe(
      836 * CHECKPOINT_FLOW_PANEL_MAX_CONTAINER_RATIO,
    );
  });

  test("retains the fixed bounds when the container has room", () => {
    expect(clampCheckpointFlowPanelWidth(200, 1600)).toBe(CHECKPOINT_FLOW_PANEL_MIN_WIDTH);
    expect(clampCheckpointFlowPanelWidth(700, 1600)).toBe(CHECKPOINT_FLOW_PANEL_MAX_WIDTH);
  });

  test("lets the panel shrink below its preferred minimum in a narrow container", () => {
    expect(clampCheckpointFlowPanelWidth(320, 400)).toBe(
      400 * CHECKPOINT_FLOW_PANEL_MAX_CONTAINER_RATIO,
    );
  });
});
