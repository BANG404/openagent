<script lang="ts">
  import Switch from "./Switch.svelte";

  let {
    statusLabel,
    statusActive = false,
    toggleLabel,
    checked = $bindable<boolean>(false),
    disabled = false,
    ariaLabel = toggleLabel,
    onCheckedChange,
  }: {
    statusLabel: string;
    statusActive?: boolean;
    toggleLabel: string;
    checked?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    onCheckedChange?: (checked: boolean) => void;
  } = $props();
</script>

<div class="settings-status-toggle">
  <span class:active={statusActive} class="settings-status-pill">
    <span class="settings-status-dot" aria-hidden="true"></span>
    {statusLabel}
  </span>
  <div class="settings-toggle-pill">
    <span>{toggleLabel}</span>
    <Switch bind:checked {disabled} {onCheckedChange} {ariaLabel} />
  </div>
</div>

<style>
  .settings-status-toggle {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 auto;
    gap: 14px;
  }

  .settings-status-pill,
  .settings-toggle-pill {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .settings-status-pill {
    gap: 6px;
  }

  .settings-status-pill.active {
    color: var(--primary);
  }

  .settings-status-dot {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .settings-toggle-pill {
    gap: 9px;
  }

  @media (max-width: 640px) {
    .settings-status-toggle {
      justify-content: space-between;
      width: 100%;
    }
  }
</style>
