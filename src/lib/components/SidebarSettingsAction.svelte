<script lang="ts">
  import { t } from "$lib/i18n";

  let {
    active,
    onToggle,
  }: {
    active: boolean;
    onToggle: () => void;
  } = $props();
</script>

<div class="sidebar-settings">
  <button class:active type="button" onclick={onToggle}>
    {#if active}
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 8H3M6 5 3 8l3 3" />
      </svg>
      <span>{$t("backToChat")}</span>
    {:else}
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="2.5" />
        <path
          d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06"
        />
      </svg>
      <span>{$t("settings")}</span>
    {/if}
  </button>
</div>

<style>
  .sidebar-settings {
    flex: 0 0 auto;
    padding: 8px 6px;
  }

  button {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--list-item-compact-content-gap);
    width: 100%;
    height: var(--list-item-compact-height);
    padding: 4px var(--list-item-compact-padding-inline);
    border: 0;
    border-radius: var(--list-item-compact-radius);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--list-item-compact-font-size);
    line-height: var(--list-item-compact-line-height);
    text-align: left;
    cursor: pointer;
    outline: none;
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  button:hover,
  button:focus-visible,
  button.active {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  button:focus-visible {
    box-shadow: var(--focus-ring);
  }

  svg {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
