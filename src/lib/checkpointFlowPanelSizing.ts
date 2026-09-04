export const CHECKPOINT_FLOW_PANEL_MIN_WIDTH = 260;
export const CHECKPOINT_FLOW_PANEL_MAX_WIDTH = 520;
export const CHECKPOINT_FLOW_PANEL_MAX_CONTAINER_RATIO = 0.45;
export const CHECKPOINT_FLOW_PANEL_DEFAULT_WIDTH = 320;
export const CHECKPOINT_FLOW_PANEL_WIDTH_STORAGE_KEY = "openagent.checkpoint-flow-panel-width";
export const CHECKPOINT_FLOW_PANEL_COLLAPSED_STORAGE_KEY =
  "openagent.checkpoint-flow-panel-collapsed";

export function loadCheckpointFlowPanelWidth(storage: Storage): number {
  const stored = Number(storage.getItem(CHECKPOINT_FLOW_PANEL_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(stored) || stored <= 0) return CHECKPOINT_FLOW_PANEL_DEFAULT_WIDTH;
  return Math.min(
    CHECKPOINT_FLOW_PANEL_MAX_WIDTH,
    Math.max(CHECKPOINT_FLOW_PANEL_MIN_WIDTH, stored),
  );
}

export function saveCheckpointFlowPanelWidth(storage: Storage, width: number): void {
  storage.setItem(CHECKPOINT_FLOW_PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)));
}

export function loadCheckpointFlowPanelCollapsed(storage: Storage): boolean {
  return storage.getItem(CHECKPOINT_FLOW_PANEL_COLLAPSED_STORAGE_KEY) !== "false";
}

export function saveCheckpointFlowPanelCollapsed(storage: Storage, collapsed: boolean): void {
  storage.setItem(CHECKPOINT_FLOW_PANEL_COLLAPSED_STORAGE_KEY, String(collapsed));
}

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
