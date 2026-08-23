<script lang="ts">
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    collapsed: boolean;
    onToggle: () => void;
  }

  let { collapsed, onToggle }: Props = $props();
</script>

<Tooltip text={collapsed ? $t("expandSidebar") : $t("collapseSidebar")} side="right">
  {#snippet trigger(props)}
    <button
      {...props}
      class="sidebar-collapse-button app-icon-button"
      type="button"
      aria-label={collapsed ? $t("expandSidebar") : $t("collapseSidebar")}
      onclick={onToggle}
    >
      <svg
        class:collapsed
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2" />
        <path d="M8 3.5v13" />
        <path class="sidebar-collapse-arrow" d="m12.25 7.25-2.5 2.75 2.5 2.75" />
      </svg>
    </button>
  {/snippet}
</Tooltip>

<style>
  .sidebar-collapse-button {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    flex: 0 0 40px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease,
      transform 120ms ease;
  }

  .sidebar-collapse-button:hover,
  .sidebar-collapse-button:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }

  .sidebar-collapse-button:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .sidebar-collapse-button:active {
    transform: scale(0.95);
  }

  svg {
    width: 18px;
    height: 18px;
  }

  .sidebar-collapse-arrow {
    transform-origin: 11px 10px;
    transition: transform 180ms ease;
  }

  svg.collapsed .sidebar-collapse-arrow {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-collapse-button,
    .sidebar-collapse-arrow {
      transition: none;
    }
  }
</style>
