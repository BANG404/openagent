<script lang="ts">
  import { t } from "$lib/i18n";

  interface Props {
    suggestions: string[];
    onSelect: (suggestion: string) => void | Promise<void>;
    variant?: "turn" | "new-conversation";
    disabled?: boolean;
  }

  let { suggestions, onSelect, variant = "turn", disabled = false }: Props = $props();
</script>

{#if suggestions.length === 3}
  <div
    class="follow-up-suggestions"
    class:new-conversation={variant === "new-conversation"}
    aria-label={$t("followUpSuggestions")}
  >
    {#each suggestions as suggestion (suggestion)}
      <button type="button" {disabled} onclick={() => onSelect(suggestion)}>
        <span aria-hidden="true">↳</span>
        <span>{suggestion}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .follow-up-suggestions {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 3px;
    box-sizing: border-box;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
    pointer-events: auto;
  }

  .follow-up-suggestions.new-conversation {
    max-width: 760px;
    margin: 10px auto 0;
    padding: 0 28px;
    border-top: 0;
  }

  button {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 7px;
    align-items: start;
    width: 100%;
    min-height: 32px;
    padding: 6px 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    line-height: 20px;
    text-align: left;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--interactive-state-bg);
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  button > span:first-child {
    color: var(--text-muted);
    font-size: 14px;
  }

  button > span:last-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .new-conversation button {
    grid-template-columns: 12px minmax(0, 1fr);
    gap: 6px;
    padding-inline: 4px;
  }
</style>
