<script lang="ts">
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  let { collapsed, onToggle }: { collapsed: boolean; onToggle: () => void } = $props();
  const label = $derived(collapsed ? $t("conversationExpand") : $t("conversationCollapse"));
</script>

<Tooltip text={label} side="bottom">
  {#snippet trigger(props)}
    <button
      {...props}
      class="conversation-toggle"
      type="button"
      aria-label={label}
      aria-controls="conversation-stage"
      aria-expanded={!collapsed}
      onclick={onToggle}
    >
      <svg class:collapsed viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2" />
        <path d="M8 3.5v13" />
        <path class="conversation-toggle-arrow" d="m12.25 7.25-2.5 2.75 2.5 2.75" />
      </svg>
    </button>
  {/snippet}
</Tooltip>

<style>
  .conversation-toggle {
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
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard);
  }
  .conversation-toggle:hover,
  .conversation-toggle:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }
  .conversation-toggle:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .conversation-toggle:active {
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
  .conversation-toggle-arrow {
    transform-origin: 10px 10px;
    transition: transform var(--motion-panel) var(--ease-enter);
  }
  svg.collapsed .conversation-toggle-arrow {
    transform: rotate(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .conversation-toggle,
    .conversation-toggle-arrow {
      transition: none;
    }
  }
</style>
