<script lang="ts">
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    canGoBack: boolean;
    canGoForward: boolean;
    onBack: () => void;
    onForward: () => void;
  }

  let { canGoBack, canGoForward, onBack, onForward }: Props = $props();
</script>

<div class="sidebar-history-controls">
  <Tooltip text={$t("navigateBack")} side="bottom">
    {#snippet trigger(props)}
      <button
        {...props}
        type="button"
        aria-label={$t("navigateBack")}
        disabled={!canGoBack}
        onclick={onBack}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m9.75 3.5-4.5 4.5 4.5 4.5" />
        </svg>
      </button>
    {/snippet}
  </Tooltip>
  <Tooltip text={$t("navigateForward")} side="bottom">
    {#snippet trigger(props)}
      <button
        {...props}
        type="button"
        aria-label={$t("navigateForward")}
        disabled={!canGoForward}
        onclick={onForward}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m6.25 3.5 4.5 4.5-4.5 4.5" />
        </svg>
      </button>
    {/snippet}
  </Tooltip>
</div>

<style>
  .sidebar-history-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
  }

  button {
    width: 28px;
    height: 32px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease,
      transform 120ms ease;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }

  button:focus-visible {
    box-shadow: var(--focus-ring);
  }

  button:active:not(:disabled) {
    transform: scale(0.94);
  }

  button:disabled {
    color: color-mix(in srgb, var(--text-muted) 42%, transparent);
    cursor: default;
  }

  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
