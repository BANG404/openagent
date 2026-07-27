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
    background: var(--surface2);
    box-shadow: var(--control-shadow);
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
  }

  button:hover:not(:disabled) {
    color: var(--text);
  }

  button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px var(--shadow);
  }

  button:disabled {
    cursor: default;
    opacity: 0.4;
  }
</style>
