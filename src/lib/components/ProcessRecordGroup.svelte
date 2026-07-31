<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "$lib/i18n";

  interface Props {
    isStreaming: boolean;
    duration?: string | null;
    children: Snippet;
  }

  let { isStreaming, duration = null, children }: Props = $props();
  let open = $state(false);
  let previousStreaming = $state<boolean | null>(null);

  $effect(() => {
    if (isStreaming === previousStreaming) return;
    open = isStreaming;
    previousStreaming = isStreaming;
  });

  let label = $derived(
    isStreaming
      ? $t("working")
      : duration
        ? `${$t("workedFor")} ${duration}`
        : $t("workDetails"),
  );
</script>

<details class="process-records" bind:open>
  <summary
    aria-label={open ? $t("collapseWorkDetails") : $t("expandWorkDetails")}
    aria-expanded={open}
  >
    <span>{label}</span>
    <svg
      class="process-chevron"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m6 4 4 4-4 4" />
    </svg>
  </summary>
  <div class="process-record-content">
    {@render children()}
  </div>
</details>

<style>
  .process-records {
    width: 100%;
    margin: 0 0 14px;
  }

  .process-records summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 30px;
    padding: 0 0 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.35;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .process-records summary::-webkit-details-marker {
    display: none;
  }

  .process-records summary:focus-visible {
    border-radius: 4px;
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .process-chevron {
    width: 14px;
    height: 14px;
    flex: none;
    transition: transform 0.16s ease;
  }

  .process-records[open] .process-chevron {
    transform: rotate(90deg);
  }

  .process-record-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 0 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .process-chevron {
      transition: none;
    }
  }
</style>
