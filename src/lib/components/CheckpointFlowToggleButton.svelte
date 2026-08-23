<script lang="ts">
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    collapsed: boolean;
    onToggle: () => void;
  }

  let { collapsed, onToggle }: Props = $props();
</script>

<Tooltip text={$t(collapsed ? "checkpointFlowExpand" : "checkpointFlowCollapse")} side="bottom">
  {#snippet trigger(props)}
    <button
      {...props}
      class="checkpoint-flow-toggle app-icon-button"
      type="button"
      aria-label={$t(collapsed ? "checkpointFlowExpand" : "checkpointFlowCollapse")}
      aria-controls="checkpoint-flow-panel"
      aria-expanded={!collapsed}
      onclick={onToggle}
    >
      <svg class:collapsed viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2" />
        <path d="M12 3.5v13" />
        <path class="checkpoint-flow-toggle-arrow" d="m7.75 7.25 2.5 2.75-2.5 2.75" />
      </svg>
    </button>
  {/snippet}
</Tooltip>

<style>
  .checkpoint-flow-toggle {
    display: grid;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease,
      transform 120ms ease;
  }

  .checkpoint-flow-toggle:hover,
  .checkpoint-flow-toggle:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }

  .checkpoint-flow-toggle:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .checkpoint-flow-toggle:active {
    transform: scale(0.95);
  }

  svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .checkpoint-flow-toggle-arrow {
    transform-origin: 9px 10px;
    transition: transform 180ms ease;
  }

  svg.collapsed .checkpoint-flow-toggle-arrow {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .checkpoint-flow-toggle,
    .checkpoint-flow-toggle-arrow {
      transition: none;
    }
  }
</style>
