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
  let expanded = $state(false);

  $effect(() => {
    if (!open) expanded = false;
  });
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
      class={expanded ? "fullscreen-surface expanded" : "fullscreen-surface"}
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
        <Tooltip text={expanded ? $t("restoreWindow") : $t("maximizeWindow")}>
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              class="fullscreen-surface-expand"
              aria-label={expanded ? $t("restoreWindow") : $t("maximizeWindow")}
              onclick={(event) => {
                event.stopPropagation();
                expanded = !expanded;
              }}
            >
              {#if expanded}
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M5.5 5.5H3v2.5M10.5 10.5H13V8M3 8l3.5-3.5M13 8l-3.5 3.5" />
                </svg>
              {:else}
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 6.5v-3h3M12.5 9.5v3h-3M6.5 3.5 3.5 6.5M9.5 12.5l3-3" />
                </svg>
              {/if}
            </button>
          {/snippet}
        </Tooltip>
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
  /* The management surface keeps the application visible around a compact,
     centered settings window. Nested configuration dialogs and toasts stay
     above it while the backdrop keeps the chat shell inactive. */
  :global(.fullscreen-surface-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: color-mix(in srgb, var(--bg) 42%, transparent);
    backdrop-filter: blur(2px);
  }

  :global(.fullscreen-surface) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 81;
    display: flex;
    flex-direction: column;
    width: min(max(640px, 75vw), 1100px, calc(100vw - 32px));
    height: min(max(400px, 80vh), 800px, calc(100vh - 48px));
    min-width: min(640px, calc(100vw - 32px));
    min-height: min(400px, calc(100vh - 48px));
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    box-sizing: border-box;
    padding: 0;
    overflow: hidden;
    resize: both;
    border: 1px solid var(--mica-divider);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--raised-shadow);
    outline: none;
    transition:
      top var(--motion-surface) var(--ease-enter),
      left var(--motion-surface) var(--ease-enter),
      width var(--motion-surface) var(--ease-enter),
      height var(--motion-surface) var(--ease-enter),
      border-radius var(--motion-surface) var(--ease-enter),
      opacity var(--motion-surface) var(--ease-enter),
      transform var(--motion-surface) var(--ease-enter);
  }

  :global(.fullscreen-surface.expanded) {
    top: 16px;
    left: 16px;
    width: calc(100vw - 32px);
    height: calc(100vh - 32px);
    min-width: 0;
    min-height: 0;
    max-width: none;
    max-height: none;
    transform: none;
    resize: none;
    border-radius: 8px;
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

  :global(.fullscreen-surface[data-window-platform="windows"] .fullscreen-surface-expand) {
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

  :global(.fullscreen-surface-expand) {
    width: 30px;
    height: 30px;
    display: grid;
    flex: none;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    outline: none;
  }

  :global(.fullscreen-surface-expand:hover),
  :global(.fullscreen-surface-expand:focus-visible) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.fullscreen-surface-expand:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.fullscreen-surface-expand svg) {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    stroke-width: 1.25;
    stroke-linecap: round;
    stroke-linejoin: round;
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
