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
  import { t, tr, setLocale, type Locale, type TranslationKeys } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";
  import Select from "./ui/Select.svelte";
  import SegmentedControl from "./ui/SegmentedControl.svelte";
  import Switch from "./ui/Switch.svelte";
  import SettingsActionButton from "./ui/SettingsActionButton.svelte";
  import SettingsListInput from "./ui/SettingsListInput.svelte";
  import SettingsStatusToggle from "./ui/SettingsStatusToggle.svelte";
  import ScrollArea from "./ui/ScrollArea.svelte";
  import PermissionSettings from "./PermissionSettings.svelte";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import SettingsAboutTab from "./SettingsAboutTab.svelte";
  import type { SettingsNav } from "$lib/settingsWindows";
  import { approvalModeDescriptionKey, DEFAULT_APP_CONFIG } from "$lib/settingsDefaults";
  const view = getContext<Record<string, unknown>>("settings-view") as Record<string, any>;
</script>

<Tabs.Content value="providers" class="settings-tab-panel">
  <div class="settings-list-col">
    <div class="list-search-bar">
      <div class="list-toolbar">
        <input
          class="list-search-input"
          placeholder={$t("searchProviders")}
          bind:value={view.providerSearch}
        />
        <SettingsActionButton
          label={view.providerFilter === "all"
            ? $t("filterAll")
            : view.providerFilter === "enabled"
              ? $t("filterEnabled")
              : $t("filterDisabled")}
          onclick={() => {
            view.providerFilter =
              view.providerFilter === "all"
                ? "enabled"
                : view.providerFilter === "enabled"
                  ? "disabled"
                  : "all";
          }}
        />
      </div>
    </div>
    <ScrollArea height="100%" class="provider-list-scroll" scrollHideDelay={350}>
      <div class="provider-list">
        {#if view.filteredProviders.length > 0}
          {#each view.filteredProviders as provider (provider.id)}
            {@const providerIcon = providerIconPath(provider.provider)}
            <ContextMenu.Root>
              <ContextMenu.Trigger>
                <button
                  class="provider-item {view.selectedProviderId === provider.id ? 'active' : ''}"
                  onclick={() => {
                    view.selectedProviderId = provider.id;
                    view.modelSearch = "";
                    view.manualModelName = "";
                  }}
                >
                  <div class="provider-item-icon">
                    <img src={providerIcon} alt="" aria-hidden="true" />
                  </div>
                  <div class="provider-item-info">
                    <span class="provider-item-name">{providerServiceName(provider)}</span>
                    <span class="provider-item-url">{view.getProviderUrl(provider)}</span>
                  </div>
                  <span
                    class:provider-enabled-dot={provider.enabled}
                    class:provider-disabled-dot={!provider.enabled}
                  ></span>
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content class="desktop-menu-panel ctx-menu-content">
                  <ContextMenu.Item
                    class="ctx-menu-item ctx-menu-item-danger"
                    onclick={() => view.removeProvider(provider.id)}
                  >
                    {$t("deleteNode")}
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          {/each}
        {:else}
          <div class="provider-list-empty">{$t("noProviders")}</div>
        {/if}
      </div>
    </ScrollArea>
    <div class="list-footer">
      <SettingsActionButton
        label={$t("addProvider")}
        icon="add"
        fullWidth
        onclick={view.addProvider}
      />
    </div>
  </div>

  {#if view.selectedProviderIndex >= 0 && view.selectedProvider}
    <div class="settings-detail-col">
      <div class="detail-top-bar">
        <span class="detail-service-name">{providerServiceName(view.selectedProvider)}</span>
        <SettingsStatusToggle
          bind:checked={view.draftConfig.providers[view.selectedProviderIndex].enabled}
          disabled={view.modelLoading[view.selectedProvider.id]}
          onCheckedChange={(checked) => view.setProviderEnabled(view.selectedProvider.id, checked)}
          ariaLabel={$t("providerEnabled")}
        />
      </div>
      <ScrollArea height="100%" class="detail-content" scrollHideDelay={350}>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("basicInfo")}</h4>
          <label class="detail-label">
            <span class="label-text">{$t("providerName")}</span>
            <input
              class="detail-input"
              bind:value={view.draftConfig.providers[view.selectedProviderIndex].name}
              placeholder={providerServiceName(view.selectedProvider)}
            />
          </label>
          <div class="detail-label">
            <span class="label-text">{$t("providerType")}</span>
            <Select
              bind:value={view.draftConfig.providers[view.selectedProviderIndex].provider}
              items={PROVIDER_CATALOG.map(({ value, label }) => ({ value, label }))}
              ariaLabel={$t("providerType")}
            />
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-section-title">{$t("apiSettings")}</h4>
          {#if view.selectedProvider.provider === "openai"}
            <div class="detail-label">
              <span class="label-text">{$t("openAiApiMode")}</span>
              <SegmentedControl
                value={view.selectedProvider.openai_api_mode}
                items={view.openAiApiModeOptions}
                ariaLabel={$t("openAiApiMode")}
                onValueChange={view.setOpenAiApiMode}
              />
            </div>
          {/if}
          <div class="detail-label">
            <span class="label-text">
              {providerRequiresApiKey(view.selectedProvider.provider)
                ? $t("apiKey")
                : view.selectedProvider.provider === "chatgpt"
                  ? $t("chatgptOAuthAccessToken")
                  : $t("apiKeyOptional")}
            </span>
            <div class="key-input-row">
              <input
                type="password"
                class="detail-input"
                bind:value={view.draftConfig.providers[view.selectedProviderIndex].api_key}
              />
              <button
                class="btn-secondary btn-sm"
                onclick={() =>
                  view.selectedProvider.provider === "chatgpt" &&
                  !view.selectedProvider.api_key.trim() &&
                  view.chatgptOAuthAuthenticated
                    ? view.logoutChatgpt(view.selectedProvider.id)
                    : view.testProvider(view.selectedProvider.id)}
                disabled={view.getStatus(view.selectedProvider.id).tone === "loading"}
                >{view.selectedProvider.provider === "chatgpt" &&
                !view.selectedProvider.api_key.trim()
                  ? view.chatgptOAuthAuthenticated
                    ? $t("signOutChatgpt")
                    : $t("signInChatgpt")
                  : $t("testConnection")}</button
              >
            </div>
          </div>
          <label class="detail-label">
            <span class="label-text">{$t("apiUrl")}</span>
            <input
              class="detail-input"
              bind:value={view.draftConfig.providers[view.selectedProviderIndex].base_url}
              placeholder={providerDefaultBaseUrl(view.selectedProvider.provider) ||
                "https://your-resource.openai.azure.com"}
            />
            <span class="base-url-preview">
              {$t("requestUrl")}: {view.getProviderPreviewUrl(view.selectedProvider)}
            </span>
          </label>
          {#if view.getStatus(view.selectedProvider.id).message}
            <div class="provider-status {view.getStatus(view.selectedProvider.id).tone}">
              {view.getStatus(view.selectedProvider.id).message}
            </div>
          {/if}
        </section>

        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t("modelList")}</h4>
            <button
              class="btn-secondary btn-sm"
              onclick={() => view.fetchModels(view.selectedProvider.id)}
              disabled={view.modelLoading[view.selectedProvider.id]}
            >
              {view.modelLoading[view.selectedProvider.id] ? $t("syncing") : $t("fetchModels")}
            </button>
          </div>
          {#if view.selectedProvider.provider === "chatgpt"}
            <p class="chatgpt-model-catalog-hint" role="note">
              {$t("chatgptModelCatalogHint")}
            </p>
          {/if}
          {#if view.selectedProvider.models.length > 0}
            <input
              class="model-search-input"
              placeholder={$t("searchModels")}
              bind:value={view.modelSearch}
            />
          {/if}
          <div class="manual-model-row">
            <input
              class="model-search-input"
              placeholder={$t("modelOrDeploymentName")}
              bind:value={view.manualModelName}
              onkeydown={(event) => {
                if (event.key === "Enter") view.addManualModel(view.selectedProvider);
              }}
            />
            <button
              class="btn-secondary btn-sm"
              onclick={() => view.addManualModel(view.selectedProvider)}>{$t("addModel")}</button
            >
          </div>
          <div class="application-settings-surface model-list-box">
            {#if view.selectedProvider.models.length === 0}
              <div class="model-list-empty">{$t("noModels")}</div>
            {:else if view.filteredModels.length === 0}
              <div class="model-list-empty">{view.modelSearch}</div>
            {:else}
              {#each view.filteredModels as modelName (modelName)}
                <div class="model-item">
                  <div class="model-main">
                    <span class="model-name">{modelName}</span>
                  </div>
                  <div class="model-item-actions">
                    <button
                      class="model-action-btn"
                      onclick={() =>
                        view.setDefaultModel("chat_model", view.selectedProvider.id, modelName)}
                      >Chat</button
                    >
                    <button
                      class="model-action-btn"
                      onclick={() =>
                        view.setDefaultModel("flash_model", view.selectedProvider.id, modelName)}
                      >Flash</button
                    >
                    <button
                      class="model-action-btn"
                      onclick={() => view.openModelConfig(view.selectedProvider.id, modelName)}
                      >{$t("configure")}</button
                    >
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </section>

        <section class="detail-section">
          <div class="application-settings-surface danger-zone">
            <div>
              <div class="danger-title">{$t("deleteNode")}</div>
              <div class="danger-copy">{$t("deleteNodeDesc")}</div>
            </div>
            <SettingsActionButton
              label={$t("deleteNode")}
              icon="trash"
              tone="danger"
              onclick={() => view.removeProvider(view.selectedProvider.id)}
            />
          </div>
        </section>
      </ScrollArea>
    </div>
  {/if}
</Tabs.Content>

<Tabs.Content value="defaults" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("chatModel")}</h4>
      <div class="detail-label">
        <span class="label-text">{$t("providerNode")}</span>
        <Select
          value={view.draftConfig.defaults.chat_model.provider_id}
          items={view.enabledProviderOptions()}
          ariaLabel={$t("providerNode")}
          onValueChange={(providerId) =>
            view.selectBindingProvider(view.draftConfig.defaults.chat_model, providerId)}
        />
      </div>
      <div class="detail-label">
        <span class="label-text">{$t("model")}</span>
        <Select
          bind:value={view.draftConfig.defaults.chat_model.model}
          items={view
            .providerModels(view.draftConfig.defaults.chat_model.provider_id)
            .map((m: string) => ({
              value: m,
              label: m,
            }))}
          placeholder={$t("model")}
          searchable
          searchPlaceholder={$t("searchModels")}
          emptyText={$t("noModels")}
          ariaLabel={$t("model")}
        />
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-section-header">
        <h4 class="detail-section-title">{$t("chatModelRetryQueue")}</h4>
        <button class="btn-secondary btn-sm" onclick={() => view.addRetryQueueModel("chat_queue")}
          >{$t("add")}</button
        >
      </div>
      <div class="application-settings-surface model-list-box retry-queue-list">
        {#if view.draftConfig.model_retry.chat_queue.length > 0}
          {#each view.draftConfig.model_retry.chat_queue as binding, index (binding)}
            <div
              class:retry-queue-dragging={view.draggedRetryQueue?.kind === "chat_queue" &&
                view.draggedRetryQueue.index === index}
              class="model-item retry-queue-item"
              role="listitem"
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => view.dropRetryQueueModel("chat_queue", index, event)}
            >
              <Tooltip text={$t("retryQueueDragHandle")}>
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="retry-queue-drag-handle"
                    type="button"
                    draggable="true"
                    aria-label={$t("retryQueueDragHandle")}
                    ondragstart={(event) => view.startRetryQueueDrag("chat_queue", index, event)}
                    ondragend={() => (view.draggedRetryQueue = null)}>⠇</button
                  >
                {/snippet}
              </Tooltip>
              <div class="retry-queue-fields">
                <Select
                  value={binding.provider_id}
                  items={view.enabledProviderOptions()}
                  ariaLabel={$t("providerNode")}
                  onValueChange={(providerId) => view.selectBindingProvider(binding, providerId)}
                />
                <Select
                  bind:value={binding.model}
                  items={view.providerModels(binding.provider_id).map((m: string) => ({
                    value: m,
                    label: m,
                  }))}
                  placeholder={$t("model")}
                  searchable
                  searchPlaceholder={$t("searchModels")}
                  emptyText={$t("noModels")}
                  ariaLabel={$t("model")}
                />
              </div>
              <button
                class="model-action-btn"
                onclick={() => view.removeRetryQueueModel("chat_queue", index)}
                >{$t("delete")}</button
              >
            </div>
          {/each}
        {:else}
          <div class="model-list-empty">{$t("noQueuedChatFallbackModels")}</div>
        {/if}
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("flashModel")}</h4>
      <div class="detail-label">
        <span class="label-text">{$t("providerNode")}</span>
        <Select
          value={view.draftConfig.defaults.flash_model.provider_id}
          items={view.enabledProviderOptions()}
          ariaLabel={$t("providerNode")}
          onValueChange={(providerId) =>
            view.selectBindingProvider(view.draftConfig.defaults.flash_model, providerId)}
        />
      </div>
      <div class="detail-label">
        <span class="label-text">{$t("model")}</span>
        <Select
          bind:value={view.draftConfig.defaults.flash_model.model}
          items={view
            .providerModels(view.draftConfig.defaults.flash_model.provider_id)
            .map((m: string) => ({
              value: m,
              label: m,
            }))}
          placeholder={$t("model")}
          searchable
          searchPlaceholder={$t("searchModels")}
          emptyText={$t("noModels")}
          ariaLabel={$t("model")}
        />
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-section-header">
        <h4 class="detail-section-title">{$t("flashModelRetryQueue")}</h4>
        <button class="btn-secondary btn-sm" onclick={() => view.addRetryQueueModel("flash_queue")}
          >{$t("add")}</button
        >
      </div>
      <div class="application-settings-surface model-list-box retry-queue-list">
        {#if view.draftConfig.model_retry.flash_queue.length > 0}
          {#each view.draftConfig.model_retry.flash_queue as binding, index (binding)}
            <div
              class:retry-queue-dragging={view.draggedRetryQueue?.kind === "flash_queue" &&
                view.draggedRetryQueue.index === index}
              class="model-item retry-queue-item"
              role="listitem"
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => view.dropRetryQueueModel("flash_queue", index, event)}
            >
              <Tooltip text={$t("retryQueueDragHandle")}>
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="retry-queue-drag-handle"
                    type="button"
                    draggable="true"
                    aria-label={$t("retryQueueDragHandle")}
                    ondragstart={(event) => view.startRetryQueueDrag("flash_queue", index, event)}
                    ondragend={() => (view.draggedRetryQueue = null)}>⠇</button
                  >
                {/snippet}
              </Tooltip>
              <div class="retry-queue-fields">
                <Select
                  value={binding.provider_id}
                  items={view.enabledProviderOptions()}
                  ariaLabel={$t("providerNode")}
                  onValueChange={(providerId) => view.selectBindingProvider(binding, providerId)}
                />
                <Select
                  bind:value={binding.model}
                  items={view.providerModels(binding.provider_id).map((m: string) => ({
                    value: m,
                    label: m,
                  }))}
                  placeholder={$t("model")}
                  searchable
                  searchPlaceholder={$t("searchModels")}
                  emptyText={$t("noModels")}
                  ariaLabel={$t("model")}
                />
              </div>
              <button
                class="model-action-btn"
                onclick={() => view.removeRetryQueueModel("flash_queue", index)}
                >{$t("delete")}</button
              >
            </div>
          {/each}
        {:else}
          <div class="model-list-empty">{$t("noQueuedFlashFallbackModels")}</div>
        {/if}
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("modelRetryPolicy")}</h4>
      <p class="detail-section-intro">{$t("modelRetryPolicyDescription")}</p>
      <div class="application-settings-surface settings-card">
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("retryCountPerModel")}</span>
            <span class="detail-hint">{$t("retryCountPerModelHint")}</span>
          </span>
          <span class="settings-card-control settings-card-number-control">
            <input
              class="detail-input settings-card-number-input"
              type="number"
              min="0"
              max="10"
              bind:value={view.draftConfig.model_retry.retry_count}
            />
          </span>
        </label>
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("retryDelaySeconds")}</span>
            <span class="detail-hint">{$t("retryDelaySecondsHint")}</span>
          </span>
          <span class="settings-card-control settings-card-number-control">
            <input
              class="detail-input settings-card-number-input"
              type="number"
              min="0"
              max="60"
              step="1"
              value={view.draftConfig.model_retry.retry_delay_ms / 1000}
              oninput={view.updateRetryDelaySeconds}
            />
          </span>
        </label>
      </div>
    </section>
  </ScrollArea>
</Tabs.Content>

<Tabs.Content value="agents" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <header class="agents-settings-intro">
      <h3>{$t("flashAgents")}</h3>
      <p>{$t("flashAgentsDescription")}</p>
    </header>

    <section class="flash-task-group" aria-labelledby="conversation-flash-tasks">
      <div class="flash-task-group-heading">
        <h4 id="conversation-flash-tasks">{$t("conversationFlashTasks")}</h4>
        <p>{$t("conversationFlashTasksDescription")}</p>
      </div>
      <div class="application-settings-surface flash-task-card">
        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("titleAgent")}</h5>
              <p>{$t("titleTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.flash_agents.title.enabled}
              ariaLabel={$t("titleAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={view.draftConfig.flash_agents.title.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={view.draftConfig.flash_agents.title.prompt}
                placeholder={$t("titleAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("suggestionsAgent")}</h5>
              <p>{$t("suggestionsTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.flash_agents.suggestions.enabled}
              ariaLabel={$t("suggestionsAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={view.draftConfig.flash_agents.suggestions.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={view.draftConfig.flash_agents.suggestions.prompt}
                placeholder={$t("suggestionsAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("memoryAgent")}</h5>
              <p>{$t("memoryTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.flash_agents.memory.enabled}
              ariaLabel={$t("memoryAgentEnabled")}
            />
          </div>
          <div class="flash-task-suboptions">
            <div class="flash-task-suboption">
              <div>
                <h6>{$t("memoryRetrieval")}</h6>
                <p>{$t("memoryRetrievalDescription")}</p>
              </div>
              <Switch
                bind:checked={view.draftConfig.memory_retrieval_enabled}
                disabled={!view.draftConfig.flash_agents.memory.enabled}
                ariaLabel={$t("memoryRetrievalEnabled")}
              />
            </div>
          </div>
          <details
            class="flash-task-custom"
            open={view.draftConfig.flash_agents.memory.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={view.draftConfig.flash_agents.memory.prompt}
                placeholder={$t("memoryAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>
      </div>
    </section>

    <section class="flash-task-group" aria-labelledby="automation-flash-tasks">
      <div class="flash-task-group-heading">
        <h4 id="automation-flash-tasks">{$t("automationFlashTasks")}</h4>
        <p>{$t("automationFlashTasksDescription")}</p>
      </div>
      <div class="application-settings-surface flash-task-card">
        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("skillCategoryAgent")}</h5>
              <p>{$t("skillCategoryTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.flash_agents.skill_category.enabled}
              ariaLabel={$t("skillCategoryAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={view.draftConfig.flash_agents.skill_category.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={view.draftConfig.flash_agents.skill_category.prompt}
                placeholder={$t("skillCategoryAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("mcpServerCategoryAgent")}</h5>
              <p>{$t("mcpServerCategoryTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.flash_agents.mcp_server_category.enabled}
              ariaLabel={$t("mcpServerCategoryAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={view.draftConfig.flash_agents.mcp_server_category.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={view.draftConfig.flash_agents.mcp_server_category.prompt}
                placeholder={$t("mcpServerCategoryAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("hookAgent")}</h5>
              <p>{$t("hookTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.flash_agents.hook.enabled}
              ariaLabel={$t("hookAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={view.draftConfig.flash_agents.hook.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={view.draftConfig.flash_agents.hook.prompt}
                placeholder={$t("hookAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("autoApprovalTask")}</h5>
              <p>{$t("autoApprovalTaskDescription")}</p>
            </div>
            <span
              class:active={view.draftConfig.approval_mode === "auto"}
              class="flash-task-mode-pill"
            >
              <span aria-hidden="true"></span>
              {$t(
                view.draftConfig.approval_mode === "auto"
                  ? "filterEnabled"
                  : "managedByApprovalMode",
              )}
            </span>
          </div>
          <details
            class="flash-task-custom"
            open={view.draftConfig.flash_agents.tool_approval.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={view.draftConfig.flash_agents.tool_approval.prompt}
                placeholder={$t("terminalApprovalTaskPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>
      </div>
    </section>
  </ScrollArea>
</Tabs.Content>

<Tabs.Content value="extensions" class="settings-tab-panel">
  <div class="settings-list-col">
    <ScrollArea height="100%" class="provider-list-scroll" scrollHideDelay={350}>
      <div class="provider-list">
        {#if view.userMcpServers.length === 0}
          <div class="provider-list-empty">{$t("noMcpServers")}</div>
        {:else}
          {#each view.userMcpServers as server (server.id)}
            <ContextMenu.Root>
              <ContextMenu.Trigger>
                <button
                  class="provider-item {view.selectedMcpId === server.id ? 'active' : ''}"
                  onclick={() => (view.selectedMcpId = server.id)}
                >
                  <div class="provider-item-icon mcp-icon">M</div>
                  <div class="provider-item-info">
                    <span class="provider-item-name">{server.name || "Unnamed"}</span>
                    <span class="provider-item-url"
                      >{server.transport === "stdio"
                        ? server.command || $t("mcpCommandPlaceholder")
                        : server.url || $t("mcpServerUrlPlaceholder")}</span
                    >
                  </div>
                  <span
                    class:provider-enabled-dot={server.enabled}
                    class:provider-disabled-dot={!server.enabled}
                  ></span>
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content class="desktop-menu-panel ctx-menu-content">
                  <ContextMenu.Item
                    class="ctx-menu-item ctx-menu-item-danger"
                    onclick={() => view.removeMcpServer(server.id)}
                  >
                    {$t("deleteNode")}
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          {/each}
        {/if}
      </div>
    </ScrollArea>
    <div class="list-footer">
      <SettingsActionButton
        label={$t("addMcpServer")}
        icon="add"
        fullWidth
        onclick={view.addMcpServer}
      />
    </div>
  </div>

  {#if view.selectedMcpServer && view.selectedMcpIndex >= 0}
    {@const server = view.draftConfig.mcp.servers[view.selectedMcpIndex]}
    {@const status = view.mcpTestStatus[server.id]}
    {@const discoveredTools = view.mcpDiscoveredTools[server.id] ?? []}
    {@const serverReady =
      server.transport === "http" ? server.url.trim().length > 0 : server.command.trim().length > 0}
    <div class="settings-detail-col">
      <div class="detail-top-bar">
        <span class="detail-service-name">{server.name || "Unnamed Server"}</span>
        <SettingsStatusToggle
          bind:checked={view.draftConfig.mcp.servers[view.selectedMcpIndex].enabled}
          disabled={status?.tone === "testing"}
          onCheckedChange={(checked) => view.setMcpEnabled(server.id, checked)}
          ariaLabel={$t("mcpEnabled")}
        />
      </div>
      <ScrollArea height="100%" class="detail-content mcp-detail-content" scrollHideDelay={350}>
        <section class="detail-section mcp-form-section">
          <h4 class="detail-section-title">{$t("basicInfo")}</h4>
          <div class="detail-grid mcp-detail-grid">
            <label class="detail-label">
              <span class="label-text">{$t("mcpServerName")}</span>
              <input
                class="detail-input"
                bind:value={view.draftConfig.mcp.servers[view.selectedMcpIndex].name}
                placeholder="My MCP Server"
              />
            </label>
          </div>
        </section>

        <section class="detail-section mcp-form-section">
          <div class="detail-section-header mcp-section-header">
            <h4 class="detail-section-title">{$t("apiSettings")}</h4>
            <SettingsActionButton
              label={status?.tone === "testing" ? $t("mcpTesting") : $t("testMcpServer")}
              icon="test"
              onclick={() => view.testMcpServer(server.id)}
              disabled={!serverReady || status?.tone === "testing"}
            />
            {#if server.transport === "http"}
              {#if view.mcpOAuthOffered(server.id)}
                <SettingsActionButton
                  label={$t("mcpAuthorize")}
                  icon="refresh"
                  onclick={() => view.authorizeMcpServer(server.id)}
                  disabled={!serverReady || status?.tone === "testing"}
                />
              {:else if view.mcpOAuthHint(server.id)}
                <p class="detail-hint mcp-oauth-hint">
                  {$t(view.mcpOAuthHint(server.id) ?? "mcpOAuthUnsupported")}
                </p>
              {/if}
            {/if}
          </div>
          <div class="detail-grid mcp-detail-grid">
            <div class="detail-label">
              <span class="label-text">{$t("mcpTransport")}</span>
              <Select
                bind:value={view.draftConfig.mcp.servers[view.selectedMcpIndex].transport}
                items={[
                  { value: "http", label: $t("mcpTransportHttp") },
                  { value: "stdio", label: $t("mcpTransportStdio") },
                ]}
                ariaLabel={$t("mcpTransport")}
              />
            </div>

            {#if server.transport === "http"}
              <label class="detail-label">
                <span class="label-text">{$t("mcpServerUrl")}</span>
                <input
                  class="detail-input"
                  bind:value={view.draftConfig.mcp.servers[view.selectedMcpIndex].url}
                  placeholder={$t("mcpServerUrlPlaceholder")}
                />
              </label>
              <label class="detail-label">
                <span class="label-text">{$t("mcpBearerToken")}</span>
                <input
                  type="password"
                  class="detail-input"
                  bind:value={view.draftConfig.mcp.servers[view.selectedMcpIndex].bearer_token}
                  placeholder={$t("mcpBearerTokenPlaceholder")}
                />
              </label>
              <div class="detail-label mcp-repeater">
                <div class="mcp-repeater-header">
                  <span class="label-text">{$t("mcpHeaders")}</span>
                  <SettingsActionButton
                    label={$t("addHeader")}
                    icon="add"
                    tone="quiet"
                    onclick={() => view.addHeader(view.selectedMcpIndex)}
                  />
                </div>
                {#each Object.entries(view.draftConfig.mcp.servers[view.selectedMcpIndex].headers) as [k] (k)}
                  <div class="env-row">
                    <input
                      class="detail-input env-key"
                      value={k}
                      placeholder={$t("mcpHeaderKeyPlaceholder")}
                      onchange={(e) =>
                        view.updateHeaderKey(
                          view.selectedMcpIndex,
                          k,
                          (e.target as HTMLInputElement).value,
                        )}
                    />
                    <input
                      class="detail-input env-val"
                      bind:value={view.draftConfig.mcp.servers[view.selectedMcpIndex].headers[k]}
                      placeholder={$t("mcpHeaderValPlaceholder")}
                    />
                    <button
                      class="model-action-btn"
                      onclick={() => view.removeHeader(view.selectedMcpIndex, k)}>×</button
                    >
                  </div>
                {/each}
              </div>
            {:else}
              <label class="detail-label">
                <span class="label-text">{$t("mcpCommand")}</span>
                <input
                  class="detail-input"
                  bind:value={view.draftConfig.mcp.servers[view.selectedMcpIndex].command}
                  placeholder={$t("mcpCommandPlaceholder")}
                />
              </label>
              <label class="detail-label">
                <span class="label-text">{$t("mcpArgs")}</span>
                <input
                  class="detail-input"
                  value={view.draftConfig.mcp.servers[view.selectedMcpIndex].args.join(" ")}
                  placeholder={$t("mcpArgsPlaceholder")}
                  oninput={(e) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    view.draftConfig.mcp.servers[view.selectedMcpIndex].args = v
                      ? v.split(/\s+/)
                      : [];
                  }}
                />
              </label>

              <div class="detail-label mcp-repeater">
                <div class="mcp-repeater-header">
                  <span class="label-text">{$t("mcpEnvVars")}</span>
                  <SettingsActionButton
                    label={$t("addEnvVar")}
                    icon="add"
                    tone="quiet"
                    onclick={() => view.addEnvVar(view.selectedMcpIndex)}
                  />
                </div>
                {#each Object.entries(view.draftConfig.mcp.servers[view.selectedMcpIndex].env) as [k] (k)}
                  <div class="env-row">
                    <input
                      class="detail-input env-key"
                      value={k}
                      placeholder={$t("mcpEnvKeyPlaceholder")}
                      onchange={(e) =>
                        view.updateEnvKey(
                          view.selectedMcpIndex,
                          k,
                          (e.target as HTMLInputElement).value,
                        )}
                    />
                    <input
                      class="detail-input env-val"
                      bind:value={view.draftConfig.mcp.servers[view.selectedMcpIndex].env[k]}
                      placeholder={$t("mcpEnvValPlaceholder")}
                    />
                    <button
                      class="model-action-btn"
                      onclick={() => view.removeEnvVar(view.selectedMcpIndex, k)}>×</button
                    >
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          {#if status && status.tone !== "idle"}
            <div
              class="provider-status {status.tone === 'success'
                ? 'success'
                : status.tone === 'error'
                  ? 'error'
                  : 'loading'}"
              style="margin-top:10px"
            >
              {status.message}
            </div>
          {/if}
        </section>

        <section class="detail-section">
          <h4 class="detail-section-title">{$t("mcpTools")}</h4>
          <p class="detail-section-intro">{$t("mcpToolsDescription")}</p>
          {#if discoveredTools.length > 0}
            <div class="application-settings-surface mcp-tool-list">
              {#each discoveredTools as tool (tool)}
                <div class="mcp-tool-row">
                  <code>{tool}</code>
                  <Switch
                    checked={!server.disabled_tools.includes(tool)}
                    onCheckedChange={(checked) => view.setMcpToolEnabled(server.id, tool, checked)}
                    ariaLabel={`${$t("mcpToolEnabled")}: ${tool}`}
                  />
                </div>
              {/each}
            </div>
          {:else}
            <p class="detail-hint mcp-tools-empty">
              {status?.tone === "testing" ? $t("mcpToolsLoading") : $t("mcpToolsEmpty")}
            </p>
          {/if}
        </section>

        <section class="application-settings-surface detail-section danger-zone">
          <p class="danger-title">{$t("deleteNode")}</p>
          <p class="danger-copy">{$t("deleteNodeDesc")}</p>
          <SettingsActionButton
            label={$t("deleteMcpServer")}
            icon="trash"
            tone="danger"
            onclick={() => view.removeMcpServer(server.id)}
          />
        </section>
      </ScrollArea>
    </div>
  {:else}
    <div class="settings-detail-col">
      <div class="extensions-placeholder">
        <span class="placeholder-icon">{$t("extensions")}</span>
        <p>{$t("noMcpServersHint")}</p>
      </div>
    </div>
  {/if}
</Tabs.Content>

<Tabs.Content value="about" class="settings-tab-panel">
  <SettingsAboutTab release={view.componentVersions.release} />
</Tabs.Content>
