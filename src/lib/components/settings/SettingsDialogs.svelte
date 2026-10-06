<script lang="ts">
  import { Dialog } from "bits-ui";
  import { t, locale } from "$lib/i18n";
  import { pluginText } from "$lib/pluginI18n";
  import Switch from "../ui/Switch.svelte";
  import SettingsActionButton from "../ui/SettingsActionButton.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { memory, plugins, providers, draft } = useSettingsContext();
</script>

<Dialog.Root
  bind:open={memory.memoryClearDialogOpen}
  onOpenChange={(open) => {
    if (open) {
      memory.memoryClearCloseHandled = false;
      return;
    }
    if (memory.memoryClearCloseHandled || memory.memoryBusy) {
      memory.memoryClearCloseHandled = false;
      return;
    }
    memory.cancelClearMemoryScope();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog">
      <Dialog.Title class="dialog-title">{$t("clearMemory")}</Dialog.Title>

      <p class="dialog-copy">{$t("memoryClearConfirm")}</p>
      <div class="confirm-token">{$t("memoryClearConfirmText")}</div>

      <label class="dialog-field" for="memory-clear-confirm-input">
        <span class="label-text">{$t("memoryClearTypePrompt")}</span>
        <input
          id="memory-clear-confirm-input"
          class="detail-input"
          autocomplete="off"
          bind:value={memory.memoryClearInput}
          onkeydown={(e) => e.key === "Enter" && memory.confirmClearMemoryScope()}
        />
      </label>

      <div class="dialog-actions">
        <button
          class="btn-secondary"
          onclick={memory.cancelClearMemoryScope}
          disabled={memory.memoryBusy}
        >
          {$t("cancel")}
        </button>
        <button
          class="btn-primary danger-primary"
          onclick={memory.confirmClearMemoryScope}
          disabled={memory.memoryBusy || memory.memoryClearInput !== $t("memoryClearConfirmText")}
        >
          {$t("clearMemory")}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root
  open={plugins.agentPluginRemoveDialogOpen}
  onOpenChange={(open) => {
    if (!open) plugins.cancelUninstallAgentPlugin();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog">
      <Dialog.Title class="dialog-title">{$t("pluginUninstall")}</Dialog.Title>
      <p class="dialog-copy">
        {$t("pluginUninstallConfirm").replace("{name}", plugins.agentPluginRemoveName)}
      </p>
      <div class="dialog-actions">
        <button
          class="btn-secondary"
          onclick={plugins.cancelUninstallAgentPlugin}
          disabled={plugins.agentPluginRemoving}
        >
          {$t("cancel")}
        </button>
        <SettingsActionButton
          label={$t("pluginUninstall")}
          icon="trash"
          tone="danger"
          onclick={plugins.confirmUninstallAgentPlugin}
          disabled={plugins.agentPluginRemoving}
        />
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root
  open={plugins.agentPluginHostAccessRequest !== null}
  onOpenChange={(open) => {
    if (!open) plugins.deferAgentPluginHostAccess();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content
      class="dialog"
      data-plugin-host-access={plugins.agentPluginHostAccessRequest?.id}
      escapeKeydownBehavior={plugins.agentPluginHostAccessBusy ? "ignore" : "close"}
      interactOutsideBehavior={plugins.agentPluginHostAccessBusy ? "ignore" : "close"}
    >
      <Dialog.Title class="dialog-title">{$t("pluginHostAccessTitle")}</Dialog.Title>
      <Dialog.Description class="dialog-copy">
        {$t("pluginHostAccessInstallDescription").replace(
          "{name}",
          pluginText(
            plugins.agentPluginHostAccessRequest?.i18n,
            $locale,
            "display_name",
            plugins.agentPluginHostAccessRequest?.name ?? "",
          ),
        )}
      </Dialog.Description>
      <p class="dialog-copy">{$t("pluginHostAccessInstallHint")}</p>
      {#if plugins.agentPluginHostAccessError}
        <p class="dialog-copy" role="alert">{plugins.agentPluginHostAccessError}</p>
      {/if}
      <div class="dialog-actions">
        <span data-plugin-host-access-defer>
          <SettingsActionButton
            label={$t("pluginHostAccessLater")}
            onclick={plugins.deferAgentPluginHostAccess}
            disabled={plugins.agentPluginHostAccessBusy}
          />
        </span>
        <span data-plugin-host-access-grant>
          <SettingsActionButton
            label={plugins.agentPluginHostAccessBusy
              ? $t("pluginHostAccessSaving")
              : $t("pluginHostAccess")}
            tone="primary"
            onclick={plugins.grantAgentPluginHostAccess}
            disabled={plugins.agentPluginHostAccessBusy}
          />
        </span>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={providers.modelConfigDialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog">
      <Dialog.Title class="dialog-title">{$t("modelConfiguration")}</Dialog.Title>

      <div class="model-config-fields">
        <label class="dialog-field" for="model-config-name">
          <span class="label-text">{$t("modelName")}</span>
          <input
            id="model-config-name"
            class="detail-input"
            autocomplete="off"
            bind:value={providers.modelConfigName}
            onkeydown={(event) => event.key === "Enter" && providers.saveModelConfig()}
          />
        </label>

        <label class="dialog-field" for="model-config-threshold">
          <span class="label-text">{$t("modelCompactionThreshold")}</span>
          <input
            id="model-config-threshold"
            class="detail-input"
            type="number"
            min="1000"
            max="1000000"
            step="1000"
            placeholder={`${draft.draftConfig.context_compaction_threshold}`}
            bind:value={providers.modelConfigThreshold}
            onkeydown={(event) => event.key === "Enter" && providers.saveModelConfig()}
          />
          <span class="field-hint">
            {$t("modelCompactionThresholdHint")}
            {draft.draftConfig.context_compaction_threshold}
          </span>
        </label>

        <label class="reasoning-support-field">
          <Switch
            bind:checked={providers.modelConfigSupportsReasoningEffort}
            disabled={providers.modelConfigUsesResponsesReasoning()}
            ariaLabel={$t("modelSupportsReasoningEffort")}
          />
          <span>
            <span class="label-text">{$t("modelSupportsReasoningEffort")}</span>
            <span class="field-hint">{$t("modelSupportsReasoningEffortHint")}</span>
          </span>
        </label>

        <label class="reasoning-support-field">
          <Switch
            bind:checked={providers.modelConfigSupportsVision}
            ariaLabel={$t("modelSupportsVision")}
          />
          <span>
            <span class="label-text">{$t("modelSupportsVision")}</span>
            <span class="field-hint">{$t("modelSupportsVisionHint")}</span>
          </span>
        </label>
      </div>

      {#if providers.modelConfigValidationError()}
        <p class="dialog-error">{providers.modelConfigValidationError()}</p>
      {/if}

      <div class="dialog-actions model-config-actions">
        <SettingsActionButton
          label={$t("deleteModel")}
          icon="trash"
          tone="danger"
          onclick={providers.deleteConfiguredModel}
        />
        <div class="dialog-actions-end">
          <button
            class="model-config-cancel"
            type="button"
            onclick={() => (providers.modelConfigDialogOpen = false)}
          >
            {$t("cancel")}
          </button>
          <SettingsActionButton
            label={$t("save")}
            tone="primary"
            onclick={providers.saveModelConfig}
            disabled={Boolean(providers.modelConfigValidationError())}
          />
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
