<script lang="ts">
  import Switch from "./Switch.svelte";

  let {
    checked = $bindable<boolean>(false),
    disabled = false,
    ariaLabel,
    onCheckedChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    ariaLabel: string;
    onCheckedChange?: (checked: boolean) => void;
  } = $props();
</script>

<Switch bind:checked {disabled} {onCheckedChange} {ariaLabel} />
