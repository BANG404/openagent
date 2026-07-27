<script lang="ts">
  import { Switch } from "bits-ui";

  let {
    checked = $bindable<boolean>(false),
    disabled = false,
    name,
    id,
    ariaLabel,
    onCheckedChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    name?: string;
    id?: string;
    ariaLabel?: string;
    onCheckedChange?: (checked: boolean) => void;
  } = $props();
</script>

<Switch.Root bind:checked {disabled} {name} {id} {onCheckedChange} class="ui-switch" aria-label={ariaLabel}>
  <Switch.Thumb class="ui-switch-thumb" />
</Switch.Root>

<style>
  :global(.ui-switch) {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
    background: var(--border);
    border: none;
    border-radius: 9999px;
    padding: 2px;
    cursor: pointer;
    transition: background 0.18s;
    outline: none;
  }
  :global(.ui-switch[data-state="checked"]) {
    background: var(--primary, #2997ff);
  }
  :global(.ui-switch:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  :global(.ui-switch:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  :global(.ui-switch-thumb) {
    display: block;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 9999px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transform: translateX(0);
    transition: transform 0.18s;
  }
  :global(.ui-switch[data-state="checked"] .ui-switch-thumb) {
    transform: translateX(16px);
  }
</style>
