<script lang="ts">
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  let {
    collapsed,
    runningCount,
    onToggle,
  }: {
    collapsed: boolean;
    runningCount: number;
    onToggle: () => void;
  } = $props();
</script>

<Tooltip
  text={$t(collapsed ? "backgroundTerminalsExpand" : "backgroundTerminalsCollapse")}
  side="bottom"
>
  {#snippet trigger(props)}
    <button
      {...props}
      class="terminal-toggle"
      class:active={!collapsed}
      type="button"
      aria-label={$t(collapsed ? "backgroundTerminalsExpand" : "backgroundTerminalsCollapse")}
      aria-controls="background-terminal-panel"
      aria-expanded={!collapsed}
      onclick={onToggle}
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2" />
        <path d="m6 8 2 2-2 2M10.5 12h3.5" />
      </svg>
      {#if runningCount > 0}
        <span class="running-count" aria-label={$t("backgroundTerminalsRunning")}
          >{Math.min(runningCount, 9)}{runningCount > 9 ? "+" : ""}</span
        >
      {/if}
    </button>
  {/snippet}
</Tooltip>

<style>
  .terminal-toggle {
    position: relative;
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

  .terminal-toggle:hover,
  .terminal-toggle:focus-visible,
  .terminal-toggle.active {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }

  .terminal-toggle:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .terminal-toggle:active {
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

  .running-count {
    position: absolute;
    top: 1px;
    right: 1px;
    min-width: 13px;
    height: 13px;
    padding: 0 3px;
    border-radius: 7px;
    box-sizing: border-box;
    background: var(--primary);
    color: white;
    font-size: 9px;
    font-weight: 600;
    line-height: 13px;
  }

  @media (prefers-reduced-motion: reduce) {
    .terminal-toggle {
      transition: none;
    }
  }
</style>
