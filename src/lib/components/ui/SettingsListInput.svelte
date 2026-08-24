<script lang="ts">
  let {
    id,
    value,
    placeholder,
    ariaLabel,
    oninput,
  }: {
    id?: string;
    value: string;
    placeholder?: string;
    ariaLabel?: string;
    oninput: (value: string) => void;
  } = $props();
</script>

<textarea
  {id}
  class="settings-list-input"
  {value}
  {placeholder}
  aria-label={ariaLabel}
  spellcheck="false"
  oninput={(event) => oninput(event.currentTarget.value)}></textarea>

<style>
  .settings-list-input {
    display: block;
    width: 100%;
    height: 84px;
    min-height: 84px;
    max-height: 84px;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    resize: none;
    scrollbar-gutter: stable;
    border-radius: 6px;
    padding: 8px 12px;
    background: var(--mica-surface);
    color: var(--text);
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    outline: none;
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    transition: box-shadow 0.2s;
  }
</style>
