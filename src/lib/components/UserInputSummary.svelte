<script lang="ts">
  import { t } from "$lib/i18n";
  import type { AskUserField, UserInputRequest } from "$lib/types";

  interface Props {
    request: UserInputRequest;
    state: "answered" | "cancelled" | "unanswered";
    response?: unknown;
  }

  let { request, state, response }: Props = $props();

  function responseValues(): Record<string, unknown> {
    if (!response || typeof response !== "object" || Array.isArray(response)) return {};
    const raw = response as Record<string, unknown>;
    if (raw.values && typeof raw.values === "object" && !Array.isArray(raw.values)) {
      return raw.values as Record<string, unknown>;
    }
    return raw;
  }

  function formatValue(field: AskUserField, value: unknown): string {
    if (value === undefined || value === null || value === "") return "-";
    if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(", ") : "-";
    if (field.type === "checkbox" || field.type === "confirm") {
      return value ? "Yes" : "No";
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
</script>

<div class="user-input-summary" class:cancelled={state !== "answered"}>
  <div class="summary-head">
    <span class="summary-title">{request.title ?? $t("askUserDefaultTitle")}</span>
    <span class="summary-badge">
      {state === "unanswered"
        ? $t("toolStatusUnanswered")
        : state === "cancelled"
          ? $t("askUserCancelled")
          : $t("askUserAnswered")}
    </span>
  </div>

  {#if request.description}
    <p class="summary-desc">{request.description}</p>
  {/if}

  {#if state === "answered"}
    {@const values = responseValues()}
    <div class="summary-fields">
      {#each request.fields as field (field.name)}
        <div class="summary-row">
          <span class="summary-label">{field.label}</span>
          <span class="summary-value">{formatValue(field, values[field.name])}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .user-input-summary {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 100%;
    margin: 8px 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    box-shadow: none;
  }

  .user-input-summary.cancelled {
    background: transparent;
    color: var(--text-muted);
  }

  .summary-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .summary-title {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 600;
  }

  .summary-badge {
    flex-shrink: 0;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--surface2);
    color: var(--text-muted);
    border: 0;
    font-size: 11px;
    line-height: 1.3;
  }

  .summary-desc {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .summary-fields {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .summary-row {
    display: grid;
    grid-template-columns: minmax(96px, 0.35fr) minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .summary-label {
    color: var(--text-muted);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .summary-value {
    color: var(--text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @media (max-width: 640px) {
    .summary-row {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
</style>
