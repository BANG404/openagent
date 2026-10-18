<script lang="ts">
  import type { InputQueueAction, InputQueueSnapshot, QueuedInput } from "$lib/openagent";
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";
  interface Props {
    snapshot?: InputQueueSnapshot;
    loading?: boolean;
    busy?: boolean;
    error?: string;
    onAction: (action: InputQueueAction) => Promise<unknown>;
    onReload: () => void;
  }
  let { snapshot, loading = false, busy = false, error = "", onAction, onReload }: Props = $props();
  let editing = $state<string | null>(null);
  let editText = $state("");
  let editRevision = $state(0);
  const waiting = $derived(
    snapshot?.items.filter((item) => item.status === "queued" && item.delivery === "next_turn") ??
      [],
  );
  function summary(item: QueuedInput) {
    return (
      item.input.text.trim() ||
      item.input.contexts?.[0]?.text ||
      item.input.attachments
        ?.map((path) =>
          path
            .split(/[\\/]/)
            .at(-1)
            ?.replace(/^queue-blob:[^:]+:/, ""),
        )
        .join(", ") ||
      ""
    );
  }
  async function act(action: InputQueueAction) {
    try {
      await onAction(action);
      return true;
    } catch {
      return false;
    }
  }
  function move(id: string, offset: number) {
    const ids = waiting.map((item) => item.id);
    const index = ids.indexOf(id);
    if (index + offset < 0 || index + offset >= ids.length) return;
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void act({ type: "reorder", ids, expectedRevision: snapshot!.revision });
  }
  async function save(item: QueuedInput) {
    if (
      await act({
        type: "update",
        id: item.id,
        input: { ...item.input, text: editText },
        expectedRevision: editRevision,
      })
    )
      editing = null;
  }
</script>

{#if loading || error || snapshot?.items.length || snapshot?.paused}
  <section class="chat-queue" aria-label={$t("messageQueue")} aria-busy={loading || busy}>
    <div class="queue-header">
      <span>{$t("messageQueue")} {snapshot?.items.length ?? ""}</span>
      {#if snapshot}
        <button
          type="button"
          disabled={busy}
          onclick={() => act({ type: "set_paused", paused: !snapshot!.paused })}
          >{snapshot.paused ? $t("resumeQueue") : $t("pauseQueue")}</button
        >
        <button
          type="button"
          disabled={busy ||
            !snapshot.items.some((item) => item.status === "queued" || item.status === "failed")}
          onclick={() => act({ type: "clear" })}>{$t("clearQueue")}</button
        >
      {/if}
    </div>
    {#if loading}<div class="queue-skeleton" aria-label={$t("loadingContent")}></div>{/if}
    {#if error}<div class="queue-error" role="alert">
        {$t("queueUpdateFailed")}
        <button type="button" disabled={busy} onclick={onReload}>{$t("retryQueue")}</button>
      </div>{/if}
    {#if snapshot?.paused}<p class="queue-notice">{$t("queuePausedNotice")}</p>{/if}
    <ol>
      {#each snapshot?.items ?? [] as item (item.id)}
        <li data-queue-id={item.id}>
          <div class="queue-item">
            <Tooltip text={summary(item)}>
              {#snippet trigger(props)}
                <span class="queue-summary" {...props}>{summary(item)}</span>
              {/snippet}
            </Tooltip>
            <span class="queue-status"
              >{item.delivery === "steer" && item.status === "queued"
                ? $t("queueSteering")
                : item.status === "failed"
                  ? $t("queueRunFailed")
                  : item.status === "queued"
                    ? $t("queueWaiting")
                    : $t("queueRunning")}</span
            >
            {#if item.status === "queued" && item.delivery === "next_turn"}
              <button
                type="button"
                disabled={busy || waiting[0]?.id === item.id}
                aria-label={$t("moveQueueUp")}
                onclick={() => move(item.id, -1)}>↑</button
              >
              <button
                type="button"
                disabled={busy || waiting.at(-1)?.id === item.id}
                aria-label={$t("moveQueueDown")}
                onclick={() => move(item.id, 1)}>↓</button
              >
              <button
                type="button"
                disabled={busy}
                onclick={() => {
                  editing = item.id;
                  editText = item.input.text;
                  editRevision = snapshot!.revision;
                }}>{$t("editQueuedMessage")}</button
              >
            {/if}
            {#if item.status === "failed"}<button
                type="button"
                disabled={busy}
                onclick={() => act({ type: "retry", id: item.id })}>{$t("retryQueue")}</button
              >{/if}
            {#if item.status === "queued" || item.status === "failed"}<button
                type="button"
                disabled={busy}
                aria-label={$t("removeQueuedMessage")}
                onclick={() => act({ type: "delete", id: item.id })}>×</button
              >{/if}
          </div>
          {#if editing === item.id}
            <div class="queue-edit">
              <textarea aria-label={$t("editQueuedMessage")} bind:value={editText} disabled={busy}
              ></textarea>
              <button type="button" disabled={busy} onclick={() => save(item)}
                >{$t("saveQueuedMessage")}</button
              >
              <button type="button" disabled={busy} onclick={() => (editing = null)}
                >{$t("cancelQueueEdit")}</button
              >
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .chat-queue {
    margin-bottom: 8px;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--card);
    color: var(--card-foreground);
    box-shadow: var(--control-shadow);
    font-size: 12px;
  }
  .queue-header,
  .queue-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
  }
  .queue-header {
    border-bottom: 1px solid var(--border);
    font-weight: 600;
  }
  .queue-header > span,
  .queue-summary {
    flex: 1;
    min-width: 0;
  }
  .queue-summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .queue-status,
  .queue-notice {
    color: var(--muted-foreground);
    font-size: 11px;
  }
  .queue-notice,
  .queue-error {
    margin: 0;
    padding: 6px 10px;
  }
  .queue-error {
    color: var(--destructive);
  }
  ol {
    list-style: none;
    padding: 4px;
    margin: 0;
    max-height: 240px;
    overflow-y: auto;
  }
  button {
    border: 0;
    border-radius: calc(var(--radius) * 0.5);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 3px 5px;
    flex: none;
  }
  button:hover:not(:disabled) {
    background: var(--interactive-state-bg);
  }
  button:focus-visible,
  textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .queue-edit {
    padding: 4px 10px 8px;
  }
  textarea {
    display: block;
    width: 100%;
    min-height: 60px;
    resize: vertical;
    border: 1px solid var(--input);
    border-radius: calc(var(--radius) * 0.5);
    background: var(--background);
    color: var(--foreground);
    padding: 6px;
    font: inherit;
  }
  .queue-skeleton {
    height: 32px;
    margin: 6px 10px;
    border-radius: calc(var(--radius) * 0.5);
    background: var(--muted);
  }
  @media (max-width: 600px) {
    .queue-item {
      flex-wrap: wrap;
    }
    .queue-summary {
      flex-basis: 60%;
    }
  }
</style>
