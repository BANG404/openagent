<script lang="ts">
  import { t } from "$lib/i18n";
  import type { UserInputRequest } from "$lib/types";

  interface Props {
    request: UserInputRequest;
    onApprove: (requestId: string) => void;
    onDeny: (requestId: string) => void;
    disabled?: boolean;
  }

  let { request, onApprove, onDeny, disabled = false }: Props = $props();
</script>

<div class="tool-approval" role="group" aria-label={$t("toolApprovalRequired")}>
  <span class="tool-approval-label">{$t("toolApprovalRequired")}</span>
  <div class="tool-approval-actions">
    <button
      {disabled}
      class="tool-approval-deny"
      type="button"
      onclick={() => onDeny(request.request_id)}
    >
      {request.cancel_label ?? $t("toolApprovalDeny")}
    </button>
    <button
      {disabled}
      class="tool-approval-approve"
      type="button"
      onclick={() => onApprove(request.request_id)}
    >
      {request.submit_label ?? $t("toolApprovalApprove")}
    </button>
  </div>
</div>

<style>
  .tool-approval {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 8px 10px;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--primary) 4%, var(--surface));
  }

  .tool-approval-label {
    font-size: 11px;
    color: var(--text-muted);
  }

  .tool-approval-actions {
    display: flex;
    gap: 7px;
    margin-left: auto;
  }

  button {
    padding: 5px 10px;
    border-radius: 6px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .tool-approval-deny {
    color: var(--text-muted);
    border: 1px solid var(--border);
    background: transparent;
  }

  .tool-approval-approve {
    color: white;
    border: 1px solid transparent;
    background: var(--primary);
  }
</style>
