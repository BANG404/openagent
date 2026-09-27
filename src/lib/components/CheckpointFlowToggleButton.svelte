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

<Tooltip text={$t(collapsed ? "checkpointFlowExpand" : "checkpointFlowCollapse")} side="bottom">
  {#snippet trigger(props)}
    <button
      {...props}
      class="checkpoint-flow-toggle"
      type="button"
      aria-label={$t(collapsed ? "checkpointFlowExpand" : "checkpointFlowCollapse")}
      aria-controls="checkpoint-flow-panel"
      aria-expanded={!collapsed}
      onclick={onToggle}
    >
      <DotIcon name="chevron-right" size={18} class={collapsed ? "collapsed-icon" : ""} />
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
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard);
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

  :global(.collapsed-icon) {
    transform: rotate(180deg);
    transition: transform var(--motion-panel) var(--ease-enter);
  }

  @media (prefers-reduced-motion: reduce) {
    .checkpoint-flow-toggle,
    :global(.collapsed-icon) {
      transition: none;
    }
  }
</style>
