<script lang="ts">
  import type { CheckpointFlow } from "$lib/checkpointFlow";
  import type { FileChange } from "$lib/types";
  import {
    clampCheckpointFlowPanelWidth,
    loadCheckpointFlowPanelWidth,
    saveCheckpointFlowPanelWidth,
  } from "$lib/checkpointFlowPanelSizing";
  import CheckpointFlowStatus from "$lib/components/CheckpointFlowStatus.svelte";

  let {
    flow,
    changes,
    onRevert,
    collapsed = $bindable(true),
  }: {
    flow: CheckpointFlow | null;
    changes: FileChange[];
    onRevert: (changeId: string) => Promise<void>;
    collapsed?: boolean;
  } = $props();

  let width = $state(
    typeof window === "undefined" ? 320 : loadCheckpointFlowPanelWidth(window.localStorage),
  );
  let resizing = $state(false);

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
  onResizeStart={startResize}
/>
