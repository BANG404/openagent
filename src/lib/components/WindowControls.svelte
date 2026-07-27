<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { onMount } from "svelte";
  import Tooltip from "./Tooltip.svelte";

  let {
    onMinimize,
    onMaximize,
    onClose,
  }: {
    onMinimize: () => void;
    onMaximize: () => void | Promise<void>;
    onClose: () => void;
  } = $props();

  let isMaximized = $state(false);
  let syncMaximizedState = async () => {};

  onMount(() => {
    if (!isTauri()) return;

    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlistenResize: (() => void) | undefined;

    syncMaximizedState = async () => {
      try {
        const nextIsMaximized = await appWindow.isMaximized();
        if (!disposed) isMaximized = nextIsMaximized;
      } catch (error) {
        console.warn("Failed to read window maximized state:", error);
      }
    };

    void syncMaximizedState();
    void appWindow.onResized(() => {
      void syncMaximizedState();
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenResize = unlisten;
      }
    });

    return () => {
      disposed = true;
      unlistenResize?.();
    };
  });

  async function handleMaximize() {
    await onMaximize();
    await syncMaximizedState();
  }
</script>

<div class="win-controls">
  <Tooltip text="Minimize" side="bottom">
    <button class="win-btn" aria-label="Minimize" onclick={onMinimize}>
      <svg width="12" height="2" viewBox="0 0 12 2" fill="none" aria-hidden="true">
        <line x1="0" y1="1" x2="12" y2="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
  </Tooltip>
  <Tooltip text={isMaximized ? "Restore" : "Maximize"} side="bottom">
    <button class="win-btn" aria-label={isMaximized ? "Restore" : "Maximize"} onclick={handleMaximize}>
      {#if isMaximized}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M4.25 3.25V2.5c0-.69.56-1.25 1.25-1.25h4c.69 0 1.25.56 1.25 1.25v4c0 .69-.56 1.25-1.25 1.25h-.75" stroke="currentColor" stroke-width="1.25"/>
          <rect x="1.25" y="3.75" width="7" height="7" rx="1.25" stroke="currentColor" stroke-width="1.25"/>
        </svg>
      {:else}
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      {/if}
    </button>
  </Tooltip>
  <Tooltip text="Close" side="bottom">
    <button class="win-btn win-close" aria-label="Close" onclick={onClose}>
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
        <line x1="1" y1="1" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="10" y1="1" x2="1" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
  </Tooltip>
</div>

<style>
  .win-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .win-btn {
    background: none;
    border: none;
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
    flex-shrink: 0;
  }

  .win-btn:hover {
    background: var(--surface2);
    color: var(--text);
  }

  .win-close:hover {
    background: #e74c3c22;
    color: #e74c3c;
  }
</style>
