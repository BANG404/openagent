<script lang="ts">
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";
  import DotIcon from "./ui/DotIcon.svelte";

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
      class="sidebar-collapse-button"
      type="button"
      aria-label={collapsed ? $t("expandSidebar") : $t("collapseSidebar")}
      onclick={onToggle}
    >
      <DotIcon name="chevron-right" size={18} class={collapsed ? "collapsed-icon" : ""} />
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
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard);
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

  :global(.collapsed-icon) {
    transform: rotate(180deg);
    transition: transform var(--motion-panel) var(--ease-enter);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-collapse-button,
    :global(.collapsed-icon) {
      transition: none;
    }
  }
</style>
