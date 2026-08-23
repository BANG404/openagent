<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { onMount } from "svelte";
  import { detectWindowPlatform, type WindowPlatform } from "$lib/windowPlatform";
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  let {
    onMinimize,
    onMaximize,
    onClose,
    platform,
    canMaximize = true,
  }: {
    onMinimize: () => void;
    onMaximize: () => void | Promise<void>;
    onClose: () => void;
    platform?: WindowPlatform;
    canMaximize?: boolean;
  } = $props();

  let isMaximized = $state(false);
  let resolvedPlatform = $derived(platform ?? detectWindowPlatform());
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
    void appWindow
      .onResized(() => {
        void syncMaximizedState();
      })
      .then((unlisten) => {
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

<div
  class="win-controls"
  class:macos={resolvedPlatform === "macos"}
  class:windows={resolvedPlatform === "windows"}
  class:maximized={isMaximized}
>
  {#if resolvedPlatform === "macos"}
    <Tooltip text={$t("closeWindow")} side="bottom">
      <button class="win-btn win-close" aria-label={$t("closeWindow")} onclick={onClose}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="m3 3 4 4m0-4L3 7" /></svg>
      </button>
    </Tooltip>
  {/if}
  <Tooltip text={$t("minimizeWindow")} side="bottom">
    <button class="win-btn win-minimize" aria-label={$t("minimizeWindow")} onclick={onMinimize}>
      <svg width="12" height="2" viewBox="0 0 12 2" fill="none" aria-hidden="true">
        <line
          x1="0"
          y1="1"
          x2="12"
          y2="1"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </Tooltip>
  {#if canMaximize}
    <Tooltip text={isMaximized ? $t("restoreWindow") : $t("maximizeWindow")} side="bottom">
      <button
        class="win-btn win-maximize"
        aria-label={isMaximized ? $t("restoreWindow") : $t("maximizeWindow")}
        onclick={handleMaximize}
      >
        {#if isMaximized}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M4.25 3.25V2.5c0-.69.56-1.25 1.25-1.25h4c.69 0 1.25.56 1.25 1.25v4c0 .69-.56 1.25-1.25 1.25h-.75"
              stroke="currentColor"
              stroke-width="1.25"
            />
            <rect
              x="1.25"
              y="3.75"
              width="7"
              height="7"
              rx="1.25"
              stroke="currentColor"
              stroke-width="1.25"
            />
          </svg>
        {:else}
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <rect
              x="0.75"
              y="0.75"
              width="9.5"
              height="9.5"
              rx="1.5"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        {/if}
      </button>
    </Tooltip>
  {/if}
  {#if resolvedPlatform !== "macos"}
    <Tooltip text={$t("closeWindow")} side="bottom">
      <button class="win-btn win-close" aria-label={$t("closeWindow")} onclick={onClose}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <path d="m1 1 9 9m0-9-9 9" />
        </svg>
      </button>
    </Tooltip>
  {/if}
</div>

<style>
  .win-controls {
    display: flex;
    align-self: stretch;
    align-items: center;
    gap: 0;
  }

  .win-btn {
    background: none;
    border: none;
    cursor: pointer;
    width: 46px;
    height: 100%;
    min-height: 32px;
    border-radius: 0;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.12s,
      color 0.12s;
    flex-shrink: 0;
  }

  .win-btn:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .win-close:hover {
    background: #e81123;
    color: #fff;
  }

  .win-controls:not(.macos) :global(.tt-trigger) {
    height: 100%;
  }

  .win-controls.windows:not(.maximized) .win-close {
    border-top-right-radius: 7px;
  }

  .win-btn svg path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .win-controls.macos {
    position: fixed;
    top: 14px;
    left: 13px;
    z-index: 12;
    align-self: center;
    gap: 8px;
    height: 28px;
  }

  .win-controls.macos .win-btn {
    width: 12px;
    height: 12px;
    min-height: 12px;
    border-radius: 50%;
    color: transparent;
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18);
  }

  .win-controls.macos .win-close {
    background: #ff5f57;
  }

  .win-controls.macos .win-minimize {
    background: #febc2e;
  }

  .win-controls.macos .win-maximize {
    background: #28c840;
  }

  .win-controls.macos:hover .win-btn {
    color: rgba(55, 22, 18, 0.74);
  }

  .win-controls.macos .win-btn:hover {
    filter: brightness(0.94);
  }

  .win-controls.macos .win-btn svg {
    width: 8px;
    height: 8px;
  }
</style>
