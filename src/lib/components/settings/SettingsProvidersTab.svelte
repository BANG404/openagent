<script lang="ts">
  import { ContextMenu, Tabs } from "bits-ui";
  import {
    PROVIDER_CATALOG,
    providerDefaultBaseUrl,
    providerIconPath,
    providerRequiresApiKey,
  } from "$lib/providerCatalog";
  import { providerServiceName } from "$lib/settingsConfig";
  import { t } from "$lib/i18n";
  import Select from "../ui/Select.svelte";
  import SegmentedControl from "../ui/SegmentedControl.svelte";
  import SettingsActionButton from "../ui/SettingsActionButton.svelte";
  import SettingsStatusToggle from "../ui/SettingsStatusToggle.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { providers, draft } = useSettingsContext();
</script>

<Tabs.Content value="providers" class="settings-tab-panel">
  <div class="settings-list-col">
    <div class="list-search-bar">
      <div class="list-toolbar">
        <input
          class="list-search-input"
          placeholder={$t("searchProviders")}
          bind:value={providers.providerSearch}
        />
        <SettingsActionButton
          label={providers.providerFilter === "all"
            ? $t("filterAll")
            : providers.providerFilter === "enabled"
              ? $t("filterEnabled")
              : $t("filterDisabled")}
          onclick={() => {
            providers.providerFilter =
              providers.providerFilter === "all"
                ? "enabled"
                : providers.providerFilter === "enabled"
                  ? "disabled"
                  : "all";
          }}
        />
      </div>
    </div>
    <ScrollArea height="100%" class="provider-list-scroll" scrollHideDelay={350}>
      <div class="provider-list">
        {#if providers.filteredProviders.length > 0}
          {#each providers.filteredProviders as provider (provider.id)}
            {@const providerIcon = providerIconPath(provider.provider)}
            <ContextMenu.Root>
              <ContextMenu.Trigger>
                <button
                  class="provider-item {providers.selectedProviderId === provider.id
                    ? 'active'
                    : ''}"
                  onclick={() => {
                    providers.selectedProviderId = provider.id;
                    providers.modelSearch = "";
                    providers.manualModelName = "";
                  }}
                >
                  <div class="provider-item-icon">
                    <img src={providerIcon} alt="" aria-hidden="true" />
                  </div>
                  <div class="provider-item-info">
                    <span class="provider-item-name">{providerServiceName(provider)}</span>
                    <span class="provider-item-url">{providers.getProviderUrl(provider)}</span>
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
                    onclick={() => providers.removeProvider(provider.id)}
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
        onclick={providers.addProvider}
      />
    </div>
  </div>

  {#if providers.selectedProviderIndex >= 0 && providers.selectedProvider}
    {@const provider = providers.selectedProvider}
    <div class="settings-detail-col">
      <div class="detail-top-bar">
        <span class="detail-service-name">{providerServiceName(provider)}</span>
        <SettingsStatusToggle
          bind:checked={draft.draftConfig.providers[providers.selectedProviderIndex].enabled}
          disabled={providers.modelLoading[provider.id]}
          onCheckedChange={(checked) => providers.setProviderEnabled(provider.id, checked)}
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
              bind:value={draft.draftConfig.providers[providers.selectedProviderIndex].name}
              placeholder={providerServiceName(provider)}
            />
          </label>
          <div class="detail-label">
            <span class="label-text">{$t("providerType")}</span>
            <Select
              bind:value={draft.draftConfig.providers[providers.selectedProviderIndex].provider}
              items={PROVIDER_CATALOG.map(({ value, label }) => ({ value, label }))}
              ariaLabel={$t("providerType")}
            />
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-section-title">{$t("apiSettings")}</h4>
          {#if provider.provider === "openai"}
            <div class="detail-label">
              <span class="label-text">{$t("openAiApiMode")}</span>
              <SegmentedControl
                value={provider.openai_api_mode}
                items={providers.openAiApiModeOptions}
                ariaLabel={$t("openAiApiMode")}
                onValueChange={providers.setOpenAiApiMode}
              />
            </div>
          {/if}
          <div class="detail-label">
            <span class="label-text">
              {providerRequiresApiKey(provider.provider)
                ? $t("apiKey")
                : provider.provider === "chatgpt"
                  ? $t("chatgptOAuthAccessToken")
                  : $t("apiKeyOptional")}
            </span>
            <div class="key-input-row">
              <input
                type="password"
                class="detail-input"
                bind:value={draft.draftConfig.providers[providers.selectedProviderIndex].api_key}
              />
              <button
                class="btn-secondary btn-sm"
                onclick={() =>
                  provider.provider === "chatgpt" &&
                  !provider.api_key.trim() &&
                  providers.chatgptOAuthAuthenticated
                    ? providers.logoutChatgpt(provider.id)
                    : providers.testProvider(provider.id)}
                disabled={providers.getStatus(provider.id).tone === "loading"}
                >{provider.provider === "chatgpt" && !provider.api_key.trim()
                  ? providers.chatgptOAuthAuthenticated
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
              bind:value={draft.draftConfig.providers[providers.selectedProviderIndex].base_url}
              placeholder={providerDefaultBaseUrl(provider.provider) ||
                "https://your-resource.openai.azure.com"}
            />
            <span class="base-url-preview">
              {$t("requestUrl")}: {providers.getProviderPreviewUrl(provider)}
            </span>
          </label>
          {#if providers.getStatus(provider.id).message}
            <div class="provider-status {providers.getStatus(provider.id).tone}">
              {providers.getStatus(provider.id).message}
            </div>
          {/if}
        </section>

        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t("modelList")}</h4>
            <button
              class="btn-secondary btn-sm"
              onclick={() => providers.fetchModels(provider.id)}
              disabled={providers.modelLoading[provider.id]}
            >
              {providers.modelLoading[provider.id] ? $t("syncing") : $t("fetchModels")}
            </button>
          </div>
          {#if provider.provider === "chatgpt"}
            <p class="chatgpt-model-catalog-hint" role="note">
              {$t("chatgptModelCatalogHint")}
            </p>
          {/if}
          {#if provider.models.length > 0}
            <input
              class="model-search-input"
              placeholder={$t("searchModels")}
              bind:value={providers.modelSearch}
            />
          {/if}
          <div class="manual-model-row">
            <input
              class="model-search-input"
              placeholder={$t("modelOrDeploymentName")}
              bind:value={providers.manualModelName}
              onkeydown={(event) => {
                if (event.key === "Enter") providers.addManualModel(provider);
              }}
            />
            <button class="btn-secondary btn-sm" onclick={() => providers.addManualModel(provider)}
              >{$t("addModel")}</button
            >
          </div>
          <div class="application-settings-surface model-list-box">
            {#if provider.models.length === 0}
              <div class="model-list-empty">{$t("noModels")}</div>
            {:else if providers.filteredModels.length === 0}
              <div class="model-list-empty">{providers.modelSearch}</div>
            {:else}
              {#each providers.filteredModels as modelName (modelName)}
                <div class="model-item">
                  <div class="model-main">
                    <span class="model-name">{modelName}</span>
                  </div>
                  <div class="model-item-actions">
                    <button
                      class="model-action-btn"
                      onclick={() =>
                        providers.setDefaultModel("chat_model", provider.id, modelName)}
                      >Chat</button
                    >
                    <button
                      class="model-action-btn"
                      onclick={() =>
                        providers.setDefaultModel("flash_model", provider.id, modelName)}
                      >Flash</button
                    >
                    <button
                      class="model-action-btn"
                      onclick={() => providers.openModelConfig(provider.id, modelName)}
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
              onclick={() => providers.removeProvider(provider.id)}
            />
          </div>
        </section>
      </ScrollArea>
    </div>
  {/if}
</Tabs.Content>
