export const CHECKPOINT_FLOW_PANEL_MIN_WIDTH = 260;
export const CHECKPOINT_FLOW_PANEL_MAX_WIDTH = 520;
export const CHECKPOINT_FLOW_PANEL_MAX_CONTAINER_RATIO = 0.45;

export function checkpointFlowPanelMaximum(containerWidth: number): number {
  const safeContainerWidth = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0;
  return Math.min(
    CHECKPOINT_FLOW_PANEL_MAX_WIDTH,
    safeContainerWidth * CHECKPOINT_FLOW_PANEL_MAX_CONTAINER_RATIO,
  );
}

export function clampCheckpointFlowPanelWidth(width: number, containerWidth: number): number {
  const maximum = checkpointFlowPanelMaximum(containerWidth);
  const minimum = Math.min(CHECKPOINT_FLOW_PANEL_MIN_WIDTH, maximum);
  return Math.min(maximum, Math.max(minimum, Math.round(width)));
}
