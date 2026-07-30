<script lang="ts">
  import { t } from "$lib/i18n";

  interface Props {
    title: string;
    detail?: string;
    tone?: "neutral" | "danger";
    messageId?: string;
    streamItemKey: string;
  }

  let { title, detail, tone = "neutral", messageId, streamItemKey }: Props = $props();

  let expanded = $state(false);
  const collapsible = $derived(
    tone === "danger" && !!detail && (detail.length > 420 || detail.split(/\r?\n/).length > 5),
  );
</script>

<div
  class="message-divider message-record"
  class:danger={tone === "danger"}
  id={messageId ? `message-${messageId}` : undefined}
  data-message-id={messageId}
  data-stream-item={streamItemKey}
  role="separator"
>
  <span class="divider-line" aria-hidden="true"></span>
  <span class="divider-content" role={tone === "danger" ? "alert" : "status"}>
    <strong>{title}</strong>
    {#if detail}
      <span class="divider-detail" class:clamped={collapsible && !expanded}>{detail}</span>
      {#if collapsible}
        <button
          class="detail-toggle"
          type="button"
          aria-expanded={expanded}
          onclick={() => (expanded = !expanded)}
          >{expanded ? $t("collapseSection") : $t("expandSection")}</button
        >
      {/if}
    {/if}
  </span>
  <span class="divider-line" aria-hidden="true"></span>
</div>

<style>
  .message-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin: 22px 0;
    color: var(--text-muted);
    font-size: 11px;
  }
  .divider-line {
    height: 1px;
    flex: 1;
    min-width: 20px;
    background: color-mix(in srgb, var(--border) 75%, transparent);
  }
  .divider-content {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    max-width: min(70%, 720px);
  }
  .divider-content strong {
    flex: none;
    font-weight: 600;
  }
  .divider-detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .message-divider.danger {
    color: var(--danger, #dc2626);
  }
  .message-divider.danger .divider-content {
    align-items: flex-start;
  }
  .message-divider.danger .divider-detail {
    overflow-wrap: anywhere;
    text-overflow: clip;
    white-space: pre-wrap;
  }
  .message-divider.danger .divider-detail.clamped {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    white-space: normal;
  }
  .detail-toggle {
    flex: none;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
  }
  .detail-toggle:hover {
    text-decoration: underline;
  }
  .detail-toggle:focus-visible {
    border-radius: 3px;
    box-shadow: var(--focus-ring);
    outline: none;
  }
  .message-divider.danger .divider-line {
    background: color-mix(in srgb, var(--danger, #dc2626) 35%, transparent);
  }
  .message-record {
    content-visibility: auto;
    contain-intrinsic-size: auto 40px;
  }
</style>
