<script lang="ts">
  import type { MouseEventHandler } from "svelte/elements";

  let {
    label,
    icon,
    tone = "secondary",
    fullWidth = false,
    disabled = false,
    onclick,
  }: {
    label: string;
    icon?: "add" | "download" | "merge" | "replace" | "test" | "trash";
    tone?: "primary" | "secondary" | "quiet" | "danger";
    fullWidth?: boolean;
    disabled?: boolean;
    onclick?: MouseEventHandler<HTMLButtonElement>;
  } = $props();
</script>

<button
  type="button"
  class="settings-action {tone}"
  class:full-width={fullWidth}
  {disabled}
  {onclick}
>
  {#if icon}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {#if icon === "add"}
        <path d="M8 3.25v9.5M3.25 8h9.5" />
      {:else if icon === "download"}
        <path d="M8 2.75v7.5m0 0 2.75-2.75M8 10.25 5.25 7.5M3 12.75h10" />
      {:else if icon === "merge"}
        <path d="M5 3v2.25A2.75 2.75 0 0 0 7.75 8H11m0 0L8.75 5.75M11 8l-2.25 2.25M5 13v-2" />
      {:else if icon === "replace"}
        <path d="m4.25 5.5 2-2 2 2M6.25 3.5v7.75M11.75 10.5l-2 2-2-2M9.75 12.5V4.75" />
      {:else if icon === "test"}
        <path
          d="M6 2.75v3.5L3.5 11a1.5 1.5 0 0 0 1.32 2.25h6.36A1.5 1.5 0 0 0 12.5 11L10 6.25v-3.5M5.25 8.5h5.5M5 2.75h6"
        />
      {:else}
        <path d="M3.5 4.5h9M6.25 2.75h3.5M5 4.5l.5 8.75h5L11 4.5M6.75 7v3.75M9.25 7v3.75" />
      {/if}
    </svg>
  {/if}
  <span>{label}</span>
</button>

<style>
  .settings-action {
    display: inline-flex;
    align-self: flex-start;
    width: fit-content;
    max-width: 100%;
    min-height: 30px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid var(--mica-divider);
    border-radius: 8px;
    background: var(--control-surface);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 400;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition:
      transform 0.1s ease,
      background-color 0.12s ease,
      color 0.12s ease;
  }

  .settings-action svg {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.35;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .settings-action.primary {
    border-color: transparent;
    border-radius: 9999px;
    background: var(--primary);
    color: white;
    box-shadow: none;
  }

  .settings-action.full-width {
    align-self: stretch;
    width: 100%;
  }

  .settings-action.quiet {
    min-height: 28px;
    padding-inline: 5px;
    border-color: transparent;
    background: transparent;
    color: var(--primary);
    box-shadow: none;
  }

  .settings-action.danger {
    border-color: color-mix(in srgb, var(--danger) 18%, transparent);
    background: color-mix(in srgb, var(--danger) 11%, transparent);
    color: var(--danger);
    box-shadow: none;
  }

  .settings-action.secondary:hover:not(:disabled) {
    background: var(--interactive-state-bg);
  }

  .settings-action.primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .settings-action.quiet:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary) 9%, transparent);
  }

  .settings-action.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 17%, transparent);
  }

  .settings-action:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .settings-action:active:not(:disabled) {
    transform: scale(0.95);
  }

  .settings-action:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
