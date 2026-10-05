<script lang="ts">
  /* The tab views intentionally consume the parent controller through context. */
  /* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
  import { getContext } from "svelte";
  import { desktopOpenAgent, invoke, listen } from "$lib/openagent/tauriClient";
  import { isTauri } from "@tauri-apps/api/core";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
  import { onMount, tick, untrack } from "svelte";
  import { Accordion, ContextMenu, Dialog, Tabs } from "bits-ui";
  import type {
    AgentMemoryEntry,
    AgentRole,
    AppConfig,
    PermissionProfile,
    ProviderConfig,
  } from "$lib/types";
  import {
    captureQuickChatShortcut,
    DEFAULT_QUICK_CHAT_SHORTCUT,
    formatQuickChatShortcut,
  } from "$lib/quickChatShortcut";
  import {
    normalizeConfigShape,
    type NormalizedAppConfig,
    type NormalizedMcpServerConfig,
  } from "$lib/config";
  import { applyDocumentTheme } from "$lib/appTheme";
  import { reportFrontendDiagnostic } from "$lib/frontendDiagnostics";
  import {
    CUA_DRIVER_COMMAND,
    CUA_DRIVER_ID,
    createCuaDriverServer,
    cuaDriverMcpArgs,
    isCuaDriverServerCurrent,
  } from "$lib/cuaDriver";
  import { cuaDriverEndpoint, startCuaDriverDaemon } from "$lib/openagent/cuaDriverHost";
  import {
    PROVIDER_CATALOG,
    providerCatalogEntry,
    providerDefaultBaseUrl,
    providerIconPath,
    providerRequiresApiKey,
  } from "$lib/providerCatalog";
  import {
    applyDetectedProviderModels,
    applyFetchedProviderModels,
    createProviderConfig,
    mcpConnectionFingerprint,
    providerConnectionFingerprint,
    providerRequestUrl,
    providerServiceName,
    repairModelBindings,
    replaceProviderModels,
    selectModelBindingProvider,
    settingsConfigChanged,
    type RetryQueueKind,
  } from "$lib/settingsConfig";
  import { t, tr, locale, setLocale, type Locale, type TranslationKeys } from "$lib/i18n";
  import { pluginText } from "$lib/pluginI18n";
  import Tooltip from "./Tooltip.svelte";
  import Select from "./ui/Select.svelte";
  import SegmentedControl from "./ui/SegmentedControl.svelte";
  import Switch from "./ui/Switch.svelte";
  import SettingsActionButton from "./ui/SettingsActionButton.svelte";
  import SettingsListInput from "./ui/SettingsListInput.svelte";
  import SettingsStatusToggle from "./ui/SettingsStatusToggle.svelte";
  import ScrollArea from "./ui/ScrollArea.svelte";
  import PermissionSettings from "./PermissionSettings.svelte";
  import SettingsAboutTab from "./SettingsAboutTab.svelte";
  import type { SettingsNav } from "$lib/settingsWindows";
  import { approvalModeDescriptionKey, DEFAULT_APP_CONFIG } from "$lib/settingsDefaults";
  const view = getContext<Record<string, unknown>>("settings-view") as Record<string, any>;
</script>

<Dialog.Root
  bind:open={view.memoryClearDialogOpen}
  onOpenChange={(open) => {
    if (open) {
      view.memoryClearCloseHandled = false;
      return;
    }
    if (view.memoryClearCloseHandled || view.memoryBusy) {
      view.memoryClearCloseHandled = false;
      return;
    }
    view.cancelClearMemoryScope();
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
          bind:value={view.memoryClearInput}
          onkeydown={(e) => e.key === "Enter" && view.confirmClearMemoryScope()}
        />
      </label>

      <div class="dialog-actions">
        <button
          class="btn-secondary"
          onclick={view.cancelClearMemoryScope}
          disabled={view.memoryBusy}
        >
          {$t("cancel")}
        </button>
        <button
          class="btn-primary danger-primary"
          onclick={view.confirmClearMemoryScope}
          disabled={view.memoryBusy || view.memoryClearInput !== $t("memoryClearConfirmText")}
        >
          {$t("clearMemory")}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root
  open={view.agentPluginRemoveDialogOpen}
  onOpenChange={(open) => {
    if (!open) view.cancelUninstallAgentPlugin();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog">
      <Dialog.Title class="dialog-title">{$t("pluginUninstall")}</Dialog.Title>
      <p class="dialog-copy">
        {$t("pluginUninstallConfirm").replace("{name}", view.agentPluginRemoveName)}
      </p>
      <div class="dialog-actions">
        <button
          class="btn-secondary"
          onclick={view.cancelUninstallAgentPlugin}
          disabled={view.agentPluginRemoving}
        >
          {$t("cancel")}
        </button>
        <SettingsActionButton
          label={$t("pluginUninstall")}
          icon="trash"
          tone="danger"
          onclick={view.confirmUninstallAgentPlugin}
          disabled={view.agentPluginRemoving}
        />
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root
  open={view.agentPluginHostAccessRequest !== null}
  onOpenChange={(open) => {
    if (!open) view.deferAgentPluginHostAccess();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content
      class="dialog"
      data-plugin-host-access={view.agentPluginHostAccessRequest?.id}
      escapeKeydownBehavior={view.agentPluginHostAccessBusy ? "ignore" : "close"}
      interactOutsideBehavior={view.agentPluginHostAccessBusy ? "ignore" : "close"}
    >
      <Dialog.Title class="dialog-title">{$t("pluginHostAccessTitle")}</Dialog.Title>
      <Dialog.Description class="dialog-copy">
        {$t("pluginHostAccessInstallDescription").replace(
          "{name}",
          pluginText(
            view.agentPluginHostAccessRequest?.i18n,
            $locale,
            "display_name",
            view.agentPluginHostAccessRequest?.name ?? "",
          ),
        )}
      </Dialog.Description>
      <p class="dialog-copy">{$t("pluginHostAccessInstallHint")}</p>
      {#if view.agentPluginHostAccessError}
        <p class="dialog-copy" role="alert">{view.agentPluginHostAccessError}</p>
      {/if}
      <div class="dialog-actions">
        <span data-plugin-host-access-defer>
          <SettingsActionButton
            label={$t("pluginHostAccessLater")}
            onclick={view.deferAgentPluginHostAccess}
            disabled={view.agentPluginHostAccessBusy}
          />
        </span>
        <span data-plugin-host-access-grant>
          <SettingsActionButton
            label={view.agentPluginHostAccessBusy
              ? $t("pluginHostAccessSaving")
              : $t("pluginHostAccess")}
            tone="primary"
            onclick={view.grantAgentPluginHostAccess}
            disabled={view.agentPluginHostAccessBusy}
          />
        </span>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={view.modelConfigDialogOpen}>
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
            bind:value={view.modelConfigName}
            onkeydown={(event) => event.key === "Enter" && view.saveModelConfig()}
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
            placeholder={`${view.draftConfig.context_compaction_threshold}`}
            bind:value={view.modelConfigThreshold}
            onkeydown={(event) => event.key === "Enter" && view.saveModelConfig()}
          />
          <span class="field-hint">
            {$t("modelCompactionThresholdHint")}
            {view.draftConfig.context_compaction_threshold}
          </span>
        </label>

        <label class="reasoning-support-field">
          <Switch
            bind:checked={view.modelConfigSupportsReasoningEffort}
            disabled={view.modelConfigUsesResponsesReasoning()}
            ariaLabel={$t("modelSupportsReasoningEffort")}
          />
          <span>
            <span class="label-text">{$t("modelSupportsReasoningEffort")}</span>
            <span class="field-hint">{$t("modelSupportsReasoningEffortHint")}</span>
          </span>
        </label>

        <label class="reasoning-support-field">
          <Switch
            bind:checked={view.modelConfigSupportsVision}
            ariaLabel={$t("modelSupportsVision")}
          />
          <span>
            <span class="label-text">{$t("modelSupportsVision")}</span>
            <span class="field-hint">{$t("modelSupportsVisionHint")}</span>
          </span>
        </label>
      </div>

      {#if view.modelConfigValidationError()}
        <p class="dialog-error">{view.modelConfigValidationError()}</p>
      {/if}

      <div class="dialog-actions model-config-actions">
        <SettingsActionButton
          label={$t("deleteModel")}
          icon="trash"
          tone="danger"
          onclick={view.deleteConfiguredModel}
        />
        <div class="dialog-actions-end">
          <button
            class="model-config-cancel"
            type="button"
            onclick={() => (view.modelConfigDialogOpen = false)}
          >
            {$t("cancel")}
          </button>
          <SettingsActionButton
            label={$t("save")}
            tone="primary"
            onclick={view.saveModelConfig}
            disabled={Boolean(view.modelConfigValidationError())}
          />
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
