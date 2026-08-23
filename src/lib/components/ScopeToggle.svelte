<script lang="ts">
  import { t } from "$lib/i18n";

  type Scope = "global" | "local";

  let {
    value,
    projectEnabled = true,
    onChange,
  }: {
    value: Scope;
    projectEnabled?: boolean;
    onChange: (scope: Scope) => void;
  } = $props();
</script>

<div class="scope-toggle" role="group" aria-label={$t("scope")}>
  <button
    class:active={value === "global"}
    type="button"
    aria-pressed={value === "global"}
    onclick={() => onChange("global")}
  >
    {$t("globalTab")}
  </button>
  <button
    class:active={value === "local"}
    type="button"
    aria-pressed={value === "local"}
    disabled={!projectEnabled}
    onclick={() => onChange("local")}
  >
    {$t("projectTab")}
  </button>
</div>

<style>
  .scope-toggle {
    display: inline-flex;
    align-items: center;
    padding: 2px;
    border: 0;
    border-radius: 7px;
    background: var(--control-surface);
    box-shadow: var(--control-shadow);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
  }

  button {
    height: 24px;
    min-width: 48px;
    padding: 0 10px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 11px;
    line-height: 24px;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      transform 0.1s;
  }

  button:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  button.active {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  button:active:not(:disabled) {
    transform: scale(0.95);
  }

  button:disabled {
    cursor: default;
    opacity: 0.4;
  }
</style>
