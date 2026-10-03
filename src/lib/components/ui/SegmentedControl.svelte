<script lang="ts" generics="Value extends string">
  type Item = { value: Value; label: string };

  let {
    value,
    items,
    ariaLabel,
    onValueChange,
    class: className = "",
    fitContent = false,
    tabs = false,
  }: {
    value: Value;
    items: Item[];
    ariaLabel: string;
    onValueChange: (value: Value) => void;
    class?: string;
    fitContent?: boolean;
    tabs?: boolean;
  } = $props();

  const activeIndex = $derived(items.findIndex((item) => item.value === value));

  function handleKeydown(event: KeyboardEvent, index: number) {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    onValueChange(items[next].value);
    const buttons = (event.currentTarget as HTMLButtonElement).parentElement?.querySelectorAll(
      "button",
    );
    buttons?.[next]?.focus();
  }
</script>

<div
  class="segmented-control {className}"
  class:fit-content={fitContent}
  role={tabs ? "tablist" : "radiogroup"}
  aria-label={ariaLabel}
  style:--segment-count={items.length}
  style:--active-index={activeIndex}
>
  {#if activeIndex >= 0}
    <span class="segmented-indicator" aria-hidden="true"></span>
  {/if}
  {#each items as item, index (item.value)}
    <button
      type="button"
      role={tabs ? "tab" : "radio"}
      aria-checked={tabs ? undefined : value === item.value}
      aria-selected={tabs ? value === item.value : undefined}
      tabindex={value === item.value || (activeIndex < 0 && index === 0) ? 0 : -1}
      data-filter={item.value}
      class:active={value === item.value}
      onclick={() => onValueChange(item.value)}
      onkeydown={(event) => handleKeydown(event, index)}
    >
      {item.label}
    </button>
  {/each}
</div>

<style>
  .segmented-control {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: repeat(var(--segment-count, 2), minmax(0, 1fr));
    gap: 2px;
    width: 100%;
    min-height: 36px;
    padding: 2px;
    border: 1px solid var(--mica-divider);
    border-radius: 7px;
    background: var(--control-surface);
  }

  .fit-content {
    width: max-content;
  }

  .segmented-indicator {
    position: absolute;
    z-index: -1;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc((100% - 4px - (var(--segment-count) - 1) * 2px) / var(--segment-count));
    border-radius: 5px;
    background: var(--surface);
    transform: translateX(calc(var(--active-index) * (100% + 2px)));
    transition:
      transform var(--motion-panel) var(--ease-enter),
      width var(--motion-panel) var(--ease-enter);
    pointer-events: none;
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
    transition:
      color var(--motion-fast) var(--ease-enter),
      background-color var(--motion-fast) var(--ease-enter);
  }

  button:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  button.active {
    background: transparent;
    color: var(--text);
    font-weight: 600;
  }

  @media (prefers-reduced-motion: reduce) {
    .segmented-indicator,
    button {
      transition: none;
    }
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
</style>
