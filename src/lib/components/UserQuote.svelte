<script lang="ts">
  import type { UserMessageContext } from "$lib/types";
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    context: UserMessageContext;
    variant?: "composer" | "message";
    onRemove?: () => void;
  }

  let { context, variant = "message", onRemove }: Props = $props();
</script>

<div class="user-quote" class:user-quote-composer={variant === "composer"}>
  <svg
    class="quote-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M3 4.5h10M3 8h7M3 11.5h5" />
  </svg>
  <span class="quote-text">{context.text}</span>
  {#if onRemove}
    <Tooltip text={$t("removeQuotedContext")}>
      {#snippet trigger(props)}
        <button
          {...props}
          class="quote-remove"
          type="button"
          aria-label={$t("removeQuotedContext")}
          onclick={onRemove}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      {/snippet}
    </Tooltip>
  {/if}
</div>

<style>
  .user-quote {
    display: flex;
    width: min(100%, 680px);
    min-width: 0;
    box-sizing: border-box;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-left: 2px solid color-mix(in srgb, var(--primary) 64%, var(--border));
    border-radius: 5px 9px 9px 5px;
    background: color-mix(in srgb, var(--control-surface) 76%, transparent);
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.42;
    text-align: left;
  }

  .user-quote-composer {
    width: 100%;
    max-width: none;
    border-radius: 5px 8px 8px 5px;
    background: color-mix(in srgb, var(--mica-divider) 48%, transparent);
  }

  .quote-icon {
    width: 14px;
    height: 14px;
    flex: none;
    margin-top: 1px;
  }

  .quote-text {
    display: -webkit-box;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .quote-remove {
    display: inline-flex;
    width: 20px;
    height: 20px;
    flex: none;
    align-items: center;
    justify-content: center;
    margin: -3px -4px 0 0;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .quote-remove:hover,
  .quote-remove:focus-visible {
    background: var(--border);
    color: var(--text);
    outline: none;
  }

  .quote-remove:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .quote-remove svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
</style>
