<script lang="ts">
  import { DEFAULT_STYLE_CONTRAST } from "$lib/styleContrast";
  import Slider from "../ui/Slider.svelte";

  let {
    value,
    ariaLabel,
    hint,
    onValueChange,
  }: {
    value?: number;
    ariaLabel: string;
    hint: string;
    onValueChange: (value: number) => void;
  } = $props();
</script>

<div class="settings-card-row" data-appearance-contrast>
  <span class="settings-card-copy">
    <span class="label-text">{ariaLabel}</span>
    <span class="detail-hint">{hint}</span>
  </span>
  <div class="settings-card-control contrast-control">
    <Slider value={value ?? DEFAULT_STYLE_CONTRAST} {ariaLabel} {onValueChange} />
    <output>{value ?? DEFAULT_STYLE_CONTRAST}</output>
  </div>
</div>

<style>
  .contrast-control {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 220px;
    max-width: 100%;
  }
  output {
    flex: 0 0 3ch;
    text-align: end;
    font-variant-numeric: tabular-nums;
    color: var(--foreground);
  }
</style>
