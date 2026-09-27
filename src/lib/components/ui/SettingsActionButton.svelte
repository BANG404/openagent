<script lang="ts">
  import type { MouseEventHandler } from "svelte/elements";
  import DotIcon from "./DotIcon.svelte";

  let {
    label,
    icon,
    tone = "secondary",
    fullWidth = false,
    disabled = false,
    onclick,
  }: {
    label: string;
    icon?:
      | "add"
      | "download"
      | "merge"
      | "replace"
      | "test"
      | "trash"
      | "refresh"
      | "sparkles"
      | "check";
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
    <DotIcon name={icon === "trash" ? "trash" : icon === "test" ? "warning" : icon} size={14} />
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
      transform var(--motion-fast) var(--ease-standard),
      background-color var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);
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
