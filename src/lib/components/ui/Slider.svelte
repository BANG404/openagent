<script lang="ts">
  import { Slider } from "bits-ui";

  let {
    value = 0,
    min = 0,
    max = 100,
    step = 1,
    ariaLabel,
    onValueChange,
  }: {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    ariaLabel: string;
    onValueChange: (value: number) => void;
  } = $props();
</script>

<Slider.Root type="single" {value} {min} {max} {step} {onValueChange} class="ui-slider">
  <span class="ui-slider-track"><Slider.Range class="ui-slider-range" /></span>
  <Slider.Thumb index={0} class="ui-slider-thumb" aria-label={ariaLabel} />
</Slider.Root>

<style>
  :global(.ui-slider) {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 32px;
    touch-action: none;
    user-select: none;
    cursor: pointer;
  }
  .ui-slider-track {
    position: relative;
    width: 100%;
    height: 2px;
    border-radius: 9999px;
    background: var(--border);
  }
  :global(.ui-slider-range) {
    position: absolute;
    height: 100%;
    border-radius: inherit;
    background: var(--primary);
  }
  :global(.ui-slider-thumb) {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--foreground);
    outline: none;
  }
  :global(.ui-slider-thumb:focus-visible) {
    box-shadow: var(--focus-ring);
  }
</style>
