<script lang="ts">
  import { t } from "$lib/i18n";
  import type { StreamItem } from "$lib/types";

  interface Props {
    item: Extract<StreamItem, { type: "compaction" }>;
  }

  let { item }: Props = $props();

  let label = $derived.by(() => {
    if (item.stage === "failed") return $t("compactionFailed");
    if (item.stage === "creating") return $t("compactionCreating");
    if (item.stage === "summarizing") return $t("compactionSummarizing");
    return $t("compactionChecking");
  });
</script>

<div
  class="compaction-status"
  class:failed={item.stage === "failed"}
  role="status"
  aria-live="polite"
>
  <span class="compaction-indicator" aria-hidden="true"></span>
  <span class="compaction-copy">
    <span>{label}</span>
    {#if item.stage === "failed" && item.error}
      <span class="compaction-error">{item.error}</span>
    {/if}
  </span>
</div>

<style>
  .compaction-status {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    max-width: min(100%, 420px);
    min-height: 34px;
    padding: 7px 10px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface2) 86%, transparent);
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.35;
  }

  .compaction-indicator {
    width: 12px;
    height: 12px;
    flex: none;
    border: 2px solid color-mix(in srgb, currentColor 38%, transparent);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: compaction-spin 0.8s linear infinite;
  }

  .compaction-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .compaction-error {
    overflow: hidden;
    color: inherit;
    font-size: 11px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compaction-status.failed {
    border-color: color-mix(in srgb, var(--warning, #d97706) 35%, var(--border));
    background: color-mix(in srgb, var(--warning, #d97706) 9%, var(--surface2));
    color: var(--warning, #b45309);
  }

  .failed .compaction-indicator {
    border-color: currentColor;
    animation: none;
  }

  @keyframes compaction-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .compaction-indicator {
      animation: none;
    }
  }
</style>
