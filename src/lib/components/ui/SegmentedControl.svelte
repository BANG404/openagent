<script lang="ts">
  type Item = { value: string; label: string };

  let {
    value,
    items,
    ariaLabel,
    onValueChange,
  }: {
    value: string;
    items: Item[];
    ariaLabel: string;
    onValueChange: (value: string) => void;
  } = $props();
</script>

<div class="segmented-control" role="radiogroup" aria-label={ariaLabel}>
  {#each items as item (item.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === item.value}
      class:active={value === item.value}
      onclick={() => onValueChange(item.value)}
    >
      {item.label}
    </button>
  {/each}
</div>

<style>
  .segmented-control {
    display: grid;
    grid-template-columns: repeat(var(--segment-count, 2), minmax(0, 1fr));
    gap: 2px;
    width: 100%;
    min-height: 36px;
    padding: 2px;
    border: 1px solid var(--mica-border);
    border-radius: 7px;
    background: var(--control-surface);
    box-shadow: var(--control-shadow);
  }

  button {
    min-width: 0;
    min-height: 30px;
    padding: 5px 10px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  button:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--control-shadow);
    font-weight: 600;
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
</style>
