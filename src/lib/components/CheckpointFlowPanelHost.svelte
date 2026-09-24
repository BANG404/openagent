<script lang="ts">
  import { onMount } from "svelte";
  import type { CheckpointFlow } from "$lib/checkpointFlow";
  import type { FileChange } from "$lib/types";
  import type { RightSidebarPanel } from "$lib/rightSidebar";
  import {
    clampCheckpointFlowPanelWidth,
    checkpointFlowPanelWidthForRatio,
    loadCheckpointFlowPanelWidth,
    saveCheckpointFlowPanelWidth,
  } from "$lib/checkpointFlowPanelSizing";
  import CheckpointFlowStatus from "$lib/components/CheckpointFlowStatus.svelte";

  let {
    flow,
    changes,
    onRevert,
    collapsed = true,
    activePanel = $bindable<RightSidebarPanel>("status"),
    terminalEnabled = false,
    terminalAvailable = false,
    terminalConversationId = null,
    terminalBranchId = null,
    rightSidebarScopeKey = "\u0000",
    onTerminalSummaryChange = () => {},
    chatGroupsEnabled = false,
    chatGroupsAvailable = false,
    chatGroupIds = [],
    chatGroupWorkspace = "",
    onChatGroupsAvailabilityChange = () => {},
  }: {
    flow: CheckpointFlow | null;
    changes: FileChange[];
    onRevert: (changeId: string) => Promise<void>;
    collapsed?: boolean;
    activePanel?: RightSidebarPanel;
    terminalEnabled?: boolean;
    terminalAvailable?: boolean;
    terminalConversationId?: string | null;
    terminalBranchId?: string | null;
    rightSidebarScopeKey?: string;
    onTerminalSummaryChange?: (runningCount: number, sessionCount: number) => void;
    chatGroupsEnabled?: boolean;
    chatGroupsAvailable?: boolean;
    chatGroupIds?: string[];
    chatGroupWorkspace?: string;
    onChatGroupsAvailabilityChange?: (available: boolean) => void;
  } = $props();

  let width = $state(
    typeof window === "undefined" ? 320 : loadCheckpointFlowPanelWidth(window.localStorage),
  );
  let resizing = $state(false);
  let widthRatio = 0;

  onMount(() => {
    const panel = document.getElementById("checkpoint-flow-panel");
    const container = panel?.parentElement;
    if (!container) return;
    let previousWidth = container.clientWidth;
    widthRatio = previousWidth > 0 ? width / previousWidth : 0;
    const observer = new ResizeObserver(() => {
      const nextWidth = container.clientWidth;
      if (nextWidth > 0 && previousWidth > 0 && nextWidth !== previousWidth) {
        width = checkpointFlowPanelWidthForRatio(widthRatio, nextWidth);
      }
      if (nextWidth > 0) previousWidth = nextWidth;
    });
    observer.observe(container);
    return () => observer.disconnect();
  });

  function startResize(event: PointerEvent): void {
    if (event.button !== 0 || collapsed || resizing) return;
    event.preventDefault();
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const panel = target.closest<HTMLElement>(".flow-panel");
    const container = panel?.parentElement;
    if (!panel || !container) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    width = startWidth;
    widthRatio = container.clientWidth > 0 ? startWidth / container.clientWidth : widthRatio;
    const previousCursor = document.documentElement.style.cursor;
    const previousUserSelect = document.documentElement.style.userSelect;
    target.setPointerCapture(pointerId);
    document.documentElement.style.cursor = "col-resize";
    document.documentElement.style.userSelect = "none";
    resizing = true;
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      width = clampCheckpointFlowPanelWidth(
        startWidth + startX - moveEvent.clientX,
        container.clientWidth,
      );
      if (container.clientWidth > 0) widthRatio = width / container.clientWidth;
    };
    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      target.removeEventListener("lostpointercapture", onEnd);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      document.documentElement.style.cursor = previousCursor;
      document.documentElement.style.userSelect = previousUserSelect;
      resizing = false;
      saveCheckpointFlowPanelWidth(window.localStorage, width);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    target.addEventListener("lostpointercapture", onEnd);
  }
</script>

<CheckpointFlowStatus
  {flow}
  {changes}
  {onRevert}
  {width}
  {collapsed}
  {resizing}
  bind:activePanel
  {terminalEnabled}
  {terminalAvailable}
  {terminalConversationId}
  {terminalBranchId}
  {rightSidebarScopeKey}
  {onTerminalSummaryChange}
  {chatGroupsEnabled}
  {chatGroupsAvailable}
  {chatGroupIds}
  {chatGroupWorkspace}
  {onChatGroupsAvailabilityChange}
  onResizeStart={startResize}
/>
