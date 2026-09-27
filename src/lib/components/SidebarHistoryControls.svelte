<script lang="ts">
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";
  import DotIcon from "./ui/DotIcon.svelte";

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
        <DotIcon name="chevron-right" size={16} class="history-back" />
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
        <DotIcon name="chevron-right" size={16} />
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
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard);
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
    color: color-mix(in srgb, var(--text-muted) 62%, transparent);
    cursor: default;
  }

  :global(.history-back) {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
