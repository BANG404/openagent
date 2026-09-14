<script lang="ts">
  import { Dialog } from "bits-ui";
  import type { Snippet } from "svelte";
  import { t } from "$lib/i18n";
  import { detectWindowPlatform, type WindowPlatform } from "$lib/windowPlatform";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import WindowControls from "$lib/components/WindowControls.svelte";

  let {
    open,
    title,
    onMinimize,
    onMaximize,
    onCloseWindow,
    onClose,
    platformOverride,
    children,
  }: {
    open: boolean;
    title: string;
    onMinimize: () => void;
    onMaximize: () => void | Promise<void>;
    onCloseWindow: () => void;
    onClose: () => void;
    platformOverride?: WindowPlatform;
    children: Snippet;
  } = $props();

  let platform = $derived(platformOverride ?? detectWindowPlatform());
  let surfaceElement = $state<HTMLElement | null>(null);
</script>

<Dialog.Root
  {open}
  onOpenChange={(next) => {
    if (!next) onClose();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="fullscreen-surface-backdrop" />
    <!-- The dialog focuses its first tabbable control on open, which is the
         close action. Tooltips open on focus as well as hover, so that lands the
         "close" tooltip on a pointer that never went there. The surface itself
         takes the initial focus instead, and the close action keeps it for
         keyboard traversal. -->
    <Dialog.Content
      class="fullscreen-surface"
      data-window-platform={platform}
      aria-label={title}
      tabindex={-1}
      bind:ref={surfaceElement}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        surfaceElement?.focus();
      }}
    >
      <header
        class="fullscreen-surface-chrome"
        data-tauri-drag-region={platform === "macos" ? "true" : undefined}
      >
        {#if platform === "macos"}
          <div class="fullscreen-surface-window-controls fullscreen-surface-mac-controls">
            <WindowControls {platform} {onMinimize} {onMaximize} onClose={onCloseWindow} />
          </div>
        {/if}
        <Dialog.Title class="fullscreen-surface-title">{title}</Dialog.Title>
        <div
          class="fullscreen-surface-drag-region"
          data-tauri-drag-region={platform === "macos" ? "true" : undefined}
          aria-hidden="true"
        ></div>
        <!-- Windows carries no window-management group here: trailing
             minimize/maximize/close would place the destructive window close
             against the routine surface close. Only macOS keeps its controls,
             which sit at the leading edge away from this close action. -->
        <Tooltip text={$t("close")}>
          {#snippet trigger(props)}
            <Dialog.Close {...props} class="fullscreen-surface-close" aria-label={$t("close")}>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </Dialog.Close>
          {/snippet}
        </Tooltip>
      </header>
      <div class="fullscreen-surface-body">
        {@render children()}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* A fullscreen surface replaces the whole window canvas, so it keeps the
     shared settings layering: nested configuration dialogs and toasts stay
     above it while it covers the application title bar and chat shell. */
  :global(.fullscreen-surface-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: var(--surface);
  }

  :global(.fullscreen-surface) {
    position: fixed;
    inset: 0;
    z-index: 81;
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    box-sizing: border-box;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: var(--surface);
    color: var(--text);
    outline: none;
  }

  :global(.fullscreen-surface-chrome) {
    position: relative;
    z-index: 2;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    height: var(--desktop-titlebar-height);
    box-sizing: border-box;
    padding: 0 8px 0 16px;
    background: transparent;
    user-select: none;
  }

  :global(.fullscreen-surface[data-window-platform="macos"] .fullscreen-surface-chrome) {
    padding-left: 92px;
  }

  :global(.fullscreen-surface[data-window-platform="windows"] .fullscreen-surface-chrome) {
    -webkit-app-region: drag;
  }

  :global(.fullscreen-surface[data-window-platform="windows"] .fullscreen-surface-close) {
    -webkit-app-region: no-drag;
  }

  :global(.fullscreen-surface-mac-controls) {
    position: absolute;
    top: 4px;
    left: 13px;
    height: 27px;
  }

  :global(.fullscreen-surface-window-controls) {
    display: flex;
    flex: none;
    align-items: center;
    align-self: stretch;
  }

  :global(.fullscreen-surface-drag-region) {
    flex: 1 1 auto;
    align-self: stretch;
    min-width: 24px;
  }

  :global(.fullscreen-surface-title) {
    flex: none;
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  :global(.fullscreen-surface-close) {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    outline: none;
  }

  :global(.fullscreen-surface-close:hover),
  :global(.fullscreen-surface-close:focus-visible) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.fullscreen-surface-close:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.fullscreen-surface-close svg) {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  :global(.fullscreen-surface-body) {
    min-height: 0;
    flex: 1;
    display: flex;
  }
</style>
