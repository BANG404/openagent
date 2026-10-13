<script lang="ts">
  import { Dialog } from "bits-ui";
  import { t } from "$lib/i18n";
  import Switch from "./ui/Switch.svelte";
  import SettingsActionButton from "./ui/SettingsActionButton.svelte";

  let {
    open = $bindable(false),
    conversationId,
    onSubmit,
  }: {
    open: boolean;
    conversationId: string | null;
    onSubmit: (description: string, convId: string | null) => Promise<string>;
  } = $props();
  let description = $state("");
  let includeTrace = $state(false);
  let submitting = $state(false);
  let failure = $state("");
  let reportId = $state("");
  let initialized = false;

  $effect(() => {
    if (!open) {
      initialized = false;
      return;
    }
    if (initialized) return;
    initialized = true;
    description = "";
    includeTrace = false;
    failure = "";
    reportId = "";
  });

  async function submit(): Promise<void> {
    if (submitting || !description.trim() || reportId) return;
    submitting = true;
    failure = "";
    try {
      reportId = await onSubmit(description.trim(), includeTrace ? conversationId : null);
    } catch (error) {
      const code = String(error);
      failure = code.includes("report_too_large")
        ? "large"
        : code.includes("report_trace_unavailable")
          ? "trace"
          : code.includes("report_logs_unavailable")
            ? "logs"
            : "upload";
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content
      class="dialog problem-report-dialog application-settings-scope"
      aria-busy={submitting}
      onEscapeKeydown={(event) => {
        if (submitting) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (submitting) event.preventDefault();
      }}
    >
      <Dialog.Title class="dialog-title">{$t("reportProblem")}</Dialog.Title>
      <Dialog.Description class="report-copy">{$t("reportProblemDescription")}</Dialog.Description>
      {#if reportId}
        <div class="report-success" role="status">
          <p>{$t("reportProblemSuccess")}</p>
          <p>{$t("reportProblemId")}: <code>{reportId}</code></p>
        </div>
      {:else}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p class="report-copy report-logs-copy">{$t("reportProblemLogsPrivacy")}</p>
          <label for="problem-description">{$t("reportProblemDetails")}</label>
          <textarea
            id="problem-description"
            class="application-settings-control"
            bind:value={description}
            rows="6"
            maxlength="20000"
            placeholder={$t("reportProblemPlaceholder")}
            disabled={submitting}></textarea>
          <div class="report-trace-row">
            <label for="problem-include-trace">{$t("reportProblemIncludeTrace")}</label>
            <Switch
              id="problem-include-trace"
              bind:checked={includeTrace}
              disabled={submitting || !conversationId}
              ariaLabel={$t("reportProblemIncludeTrace")}
            />
          </div>
          <p class="report-copy">
            {conversationId ? $t("reportProblemTracePrivacy") : $t("reportProblemNoConversation")}
          </p>
          {#if failure}
            <p class="report-error" role="alert">
              {failure === "large"
                ? $t("reportProblemTooLarge")
                : failure === "trace"
                  ? $t("reportProblemTraceFailed")
                  : failure === "logs"
                    ? $t("reportProblemLogsFailed")
                    : $t("reportProblemFailed")}
            </p>
          {/if}
          <div class="dialog-actions">
            <SettingsActionButton
              label={$t("cancel")}
              tone="quiet"
              disabled={submitting}
              onclick={() => (open = false)}
            />
            <SettingsActionButton
              label={submitting ? $t("reportProblemSubmitting") : $t("reportProblemSubmit")}
              tone="primary"
              disabled={submitting || !description.trim()}
              onclick={() => void submit()}
            />
          </div>
        </form>
      {/if}
      {#if reportId}
        <div class="dialog-actions">
          <SettingsActionButton label={$t("close")} onclick={() => (open = false)} />
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.problem-report-dialog) {
    width: 540px;
    background: var(--surface);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 20px;
  }
  label {
    font-size: 13px;
    font-weight: 500;
  }
  textarea {
    width: 100%;
    resize: vertical;
    height: auto;
    min-height: 120px;
    max-height: 35vh;
    padding: 12px;
    border-radius: 8px;
    font: inherit;
  }
  .report-copy {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-muted);
    margin: 0;
  }
  .report-trace-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .report-error {
    color: var(--danger);
    font-size: 13px;
    margin: 0;
  }
  .report-success {
    padding-top: 12px;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  .dialog-actions {
    margin-top: 12px;
  }
</style>
