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
    AgentPluginUpdateSummary,
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
  import { agentPluginUpdateErrorKey } from "$lib/agentPluginUpdateCheck";
  import { desktopPluginInstallQueue, type PluginInstallTask } from "$lib/agentPluginInstallQueue";
  import PluginInstallNotice from "./PluginInstallNotice.svelte";
  import PluginLanguageSupport from "./PluginLanguageSupport.svelte";
  import { pluginText } from "$lib/pluginI18n";
  import type { OfficialPluginCatalogItem } from "$lib/officialPluginRegistry";
  import { applyDocumentTheme } from "$lib/appTheme";
  import { reportFrontendDiagnostic } from "$lib/frontendDiagnostics";
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

<Tabs.Content value="general" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("appearance")}</h4>
      <div class="application-settings-surface settings-card">
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("theme")}</span>
            <span class="detail-hint">{$t("themeHint")}</span>
          </span>
          <div class="settings-card-control">
            <Select
              bind:value={view.draftConfig.theme}
              items={[
                { value: "system", label: $t("themeSystem") },
                { value: "light", label: $t("themeLight") },
                { value: "dark", label: $t("themeDark") },
              ]}
              ariaLabel={$t("theme")}
            />
          </div>
        </div>
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("language")}</span>
            <span class="detail-hint">{$t("languageHint")}</span>
          </span>
          <div class="settings-card-control">
            <Select
              bind:value={view.draftConfig.language}
              items={[
                { value: "zh", label: "中文" },
                { value: "en", label: "English" },
              ]}
              ariaLabel={$t("language")}
            />
          </div>
        </div>
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("messageLayout")}</span>
            <span class="detail-hint">{$t("messageLayoutHint")}</span>
          </span>
          <div class="settings-card-control">
            <Select
              bind:value={view.draftConfig.message_layout}
              items={[
                { value: "single", label: $t("messageLayoutSingle") },
                { value: "responsive_double", label: $t("messageLayoutResponsiveDouble") },
              ]}
              ariaLabel={$t("messageLayout")}
            />
          </div>
        </div>
        {#if view.draftConfig.message_layout === "responsive_double"}
          <label class="settings-card-row">
            <span class="settings-card-copy">
              <span class="label-text">{$t("messageDoubleColumnMinWidth")}</span>
              <span class="detail-hint">{$t("messageDoubleColumnHint")}</span>
            </span>
            <input
              type="number"
              class="detail-input settings-card-number-input"
              min="960"
              max="2400"
              step="40"
              bind:value={view.draftConfig.message_double_column_min_width}
            />
          </label>
        {/if}
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("bookModeFontSize")}</span>
            <span class="detail-hint">{$t("bookModeFontSizeHint")}</span>
          </span>
          <input
            type="number"
            class="detail-input settings-card-number-input"
            min="14"
            max="24"
            step="1"
            bind:value={view.draftConfig.book_mode_font_size}
          />
        </label>
      </div>
    </section>
    <section class="detail-section" data-settings-section="context-compaction">
      <h4 class="detail-section-title">{$t("compactionTask")}</h4>
      <div class="application-settings-surface settings-card">
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("contextCompaction")}</span>
            <span class="detail-hint">{$t("compactionTaskDescription")}</span>
          </span>
          <div class="settings-card-control compaction-toggle-control">
            <Switch
              bind:checked={view.draftConfig.context_compaction_enabled}
              ariaLabel={$t("contextCompaction")}
            />
          </div>
        </div>
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("contextCompactionThreshold")}</span>
            <span class="detail-hint">{$t("contextCompactionThresholdHint")}</span>
          </span>
          <input
            type="number"
            class="detail-input settings-card-number-input"
            min="1000"
            max="1000000"
            step="1000"
            disabled={!view.draftConfig.context_compaction_enabled}
            bind:value={view.draftConfig.context_compaction_threshold}
          />
        </label>
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("contextCompactionRecentMessageCount")}</span>
            <span class="detail-hint">{$t("contextCompactionRecentMessageCountHint")}</span>
          </span>
          <input
            type="number"
            class="detail-input settings-card-number-input"
            min="0"
            max="20"
            step="1"
            disabled={!view.draftConfig.context_compaction_enabled}
            bind:value={view.draftConfig.context_compaction_recent_message_count}
          />
        </label>
        <div class="settings-card-row">
          <details
            class="compaction-custom-prompt"
            open={view.draftConfig.context_compaction_prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input"
                bind:value={view.draftConfig.context_compaction_prompt}
                placeholder={$t("compactionTaskPromptPlaceholder")}></textarea>
            </label>
          </details>
        </div>
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("quickChat")}</h4>
      <div class="application-settings-surface shortcut-setting-row">
        <div class="shortcut-setting-copy">
          <span class="label-text">{$t("quickShortcutLabel")}</span>
          <p class="detail-hint">{$t("quickShortcutHint")}</p>
        </div>
        <div class="shortcut-setting-controls">
          <button
            type="button"
            class="shortcut-recorder"
            class:recording={view.quickShortcutRecording}
            aria-label={$t("quickShortcutLabel")}
            aria-pressed={view.quickShortcutRecording}
            onclick={() => {
              view.quickShortcutRecording = true;
              view.quickShortcutStatus = { tone: "idle", message: "" };
            }}
            onblur={() => (view.quickShortcutRecording = false)}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="3.25" width="12" height="9.5" rx="2" />
              <path d="M4.5 6h.01M7 6h.01M9.5 6h.01M12 6h.01M5.25 9.5h5.5" />
            </svg>
            <span>
              {view.quickShortcutRecording
                ? $t("quickShortcutRecording")
                : formatQuickChatShortcut(view.draftConfig.quick_chat_shortcut)}
            </span>
          </button>
          <button
            type="button"
            class="dialog-action-quiet shortcut-reset"
            disabled={view.draftConfig.quick_chat_shortcut === DEFAULT_QUICK_CHAT_SHORTCUT}
            onclick={() => void view.commitQuickChatShortcut(DEFAULT_QUICK_CHAT_SHORTCUT)}
          >
            {$t("reset")}
          </button>
        </div>
      </div>
      {#if view.quickShortcutStatus.message}
        <div
          class="shortcut-status {view.quickShortcutStatus.tone}"
          role={view.quickShortcutStatus.tone === "error" ? "alert" : "status"}
        >
          {view.quickShortcutStatus.message}
        </div>
      {/if}
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("privacyDiagnostics")}</h4>
      <div class="application-settings-surface startup-row">
        <div class="startup-copy">
          <span class="label-text">{$t("diagnosticLogCollection")}</span>
          <p class="detail-hint">{$t("diagnosticLogCollectionHint")}</p>
        </div>
        <Switch
          bind:checked={view.draftConfig.diagnostic_log_collection_enabled}
          ariaLabel={$t("diagnosticLogCollection")}
        />
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("startup")}</h4>
      <div class="application-settings-surface startup-row">
        <div class="startup-copy">
          <span class="label-text">{$t("launchOnStartup")}</span>
          <p class="detail-hint">{$t("launchOnStartupHint")}</p>
        </div>
        <Switch
          bind:checked={view.draftConfig.launch_on_startup}
          disabled={!view.autostartReady || view.autostartSyncing}
          ariaLabel={$t("launchOnStartup")}
        />
      </div>
      {#if view.autostartStatus}
        <div class="provider-status error" style="margin-top:8px">{view.autostartStatus}</div>
      {/if}
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("mentionPalette")}</h4>
      <div class="application-settings-surface startup-row">
        <div class="startup-copy">
          <span class="label-text">{$t("showGlobalDraftsInMentions")}</span>
          <p class="detail-hint">{$t("showGlobalDraftsInMentionsHint")}</p>
        </div>
        <Switch
          bind:checked={view.draftConfig.mention_palette_show_global_drafts}
          ariaLabel={$t("showGlobalDraftsInMentions")}
        />
      </div>
    </section>
  </ScrollArea>
</Tabs.Content>

<Tabs.Content value="plugins" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <header class="agents-settings-intro plugin-management-header">
      <h3>{$t("plugins")}</h3>
      <SegmentedControl
        class="plugin-management-tabs"
        fitContent
        tabs
        ariaLabel={$t("plugins")}
        value={view.pluginManagementView}
        items={[
          { value: "marketplace", label: $t("pluginMarketplaceTab") },
          { value: "installed", label: $t("pluginInstalledTab") },
        ]}
        onValueChange={(value) => (view.pluginManagementView = value)}
      />
    </header>
    {#each view.agentPluginInstallTasks as task (task.key)}
      {#if task.status !== "running" || view.pluginManagementView !== "marketplace" || !view.officialPluginCards.some((plugin: OfficialPluginCatalogItem) => plugin.id === task.pluginId)}
        {#if task.status === "running"}
          <div
            class="plugin-install-progress"
            data-plugin-id={task.pluginId ?? task.key}
            data-install-status={task.status}
            data-stage={task.progress.stage}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <progress aria-label={`${task.label} · ${view.agentPluginInstallMessage(task)}`}
            ></progress>
            <span>{task.label} · {view.agentPluginInstallMessage(task)}</span>
          </div>
        {:else}
          <PluginInstallNotice
            {task}
            message={view.agentPluginInstallMessage(task)}
            ondismiss={() => desktopPluginInstallQueue.dismiss(task.key)}
          />
        {/if}
      {/if}
    {/each}
    {#if view.pluginManagementView === "marketplace"}
      <section class="official-plugin-store" aria-label={$t("pluginOfficialMarketplace")}>
        <div class="official-plugin-store-toolbar">
          <label class="official-plugin-search">
            <span class="sr-only">{$t("pluginOfficialSearch")}</span>
            <input
              class="detail-input"
              type="search"
              placeholder={$t("pluginOfficialSearchPlaceholder")}
              bind:value={view.officialPluginQuery}
            />
          </label>
          {#if view.officialPluginQuery}
            <button
              type="button"
              class="official-plugin-clear"
              onclick={() => (view.officialPluginQuery = "")}
            >
              {$t("pluginOfficialClearSearch")}
            </button>
          {/if}
          <SegmentedControl
            class="official-plugin-filters"
            fitContent
            tabs
            ariaLabel={$t("pluginOfficialFilter")}
            value={view.officialPluginFilter}
            items={[
              { value: "all", label: $t("pluginOfficialFilterAll") },
              { value: "available", label: $t("pluginOfficialFilterAvailable") },
              { value: "installed", label: $t("pluginOfficialFilterInstalled") },
            ]}
            onValueChange={(value) => (view.officialPluginFilter = value)}
          />
        </div>
        {#if view.officialPluginCards.length > 0}
          <div class="official-plugin-grid">
            {#each view.officialPluginCards as plugin (plugin.id)}
              <article
                class="official-plugin-card"
                data-plugin-id={plugin.id}
                data-installed={plugin.installed ? "true" : "false"}
              >
                <div class="official-plugin-card-heading">
                  <div class="official-plugin-card-copy">
                    <div class="official-plugin-card-title-row">
                      <h5>{plugin.displayName}</h5>
                      {#if plugin.installed}
                        <span
                          class:official-plugin-update={plugin.updateAvailable}
                          class="official-plugin-state"
                        >
                          {plugin.updateAvailable
                            ? $t("pluginUpdateAvailable")
                            : $t("pluginMarketplaceInstalled")}
                        </span>
                      {:else}
                        <span class="official-plugin-state available"
                          >{$t("pluginOfficialAvailable")}</span
                        >
                      {/if}
                    </div>
                    <span class="detail-hint">{plugin.id}</span>
                  </div>
                </div>
                {#if plugin.description}
                  <p class="official-plugin-description">{plugin.description}</p>
                {/if}
                <PluginLanguageSupport i18n={plugin.i18n} />
                <div class="official-plugin-meta">
                  <span>
                    {#if plugin.installed && plugin.currentVersion}
                      {$t("pluginOfficialInstalledVersion").replace(
                        "{version}",
                        plugin.currentVersion,
                      )}
                    {:else if plugin.version}
                      {$t("pluginOfficialVersion").replace("{version}", plugin.version)}
                    {:else}
                      {$t("pluginOfficialVersionUnknown")}
                    {/if}
                  </span>
                  <span class="official-plugin-standard">{$t("pluginOfficialStandard")}</span>
                  <a href={plugin.homepage ?? plugin.repository} target="_blank" rel="noreferrer">
                    {$t("pluginOfficialSource")}
                  </a>
                </div>
                <div class="official-plugin-card-actions">
                  {#each view.agentPluginInstallTasks.filter((task: PluginInstallTask) => task.pluginId === plugin.id && task.status === "running") as task (task.key)}
                    <div
                      class="plugin-install-progress plugin-install-progress-inline"
                      data-plugin-id={plugin.id}
                      data-install-status={task.status}
                      data-stage={task.progress.stage}
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      <progress
                        aria-label={`${task.label} · ${view.agentPluginInstallMessage(task)}`}
                      ></progress>
                      <span>{view.agentPluginInstallMessage(task)}</span>
                    </div>
                  {/each}
                  {#if plugin.installed && plugin.updateAvailable}
                    <SettingsActionButton
                      label={$t("pluginUpdate")}
                      icon="download"
                      tone="primary"
                      onclick={() => view.updateAgentPlugin(plugin.id)}
                      disabled={view.agentPluginUpdating !== null}
                    />
                  {:else if plugin.installed}
                    <span class="official-plugin-installed-copy"
                      >{$t("pluginOfficialInstalled")}</span
                    >
                  {:else}
                    <SettingsActionButton
                      label={view.agentPluginInstalling(plugin.id)
                        ? $t("pluginOfficialInstalling")
                        : $t("pluginMarketplaceInstall")}
                      icon="download"
                      tone="primary"
                      onclick={() => view.installOfficialAgentPlugin(plugin)}
                      disabled={view.agentPluginInstalling(plugin.id) ||
                        view.agentPluginUpdating === plugin.id ||
                        view.agentPluginRemoveId === plugin.id}
                    />
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="official-plugin-empty">{$t("pluginOfficialEmpty")}</div>
        {/if}
      </section>
    {:else}
      <div class="plugin-directory-heading">
        <div class="plugin-directory-title">
          <span class="label-text">{$t("pluginInstalledPlugins")}</span>
          <span class="plugin-directory-count">{view.agentPlugins.length}</span>
        </div>
        <div class="plugin-directory-actions">
          <SettingsActionButton
            label={$t("pluginInstall")}
            icon="add"
            onclick={() => view.installAgentPlugin()}
          />
          <SettingsActionButton
            label={view.agentPluginUpdatesLoading
              ? $t("pluginCheckingUpdates")
              : $t("pluginCheckUpdates")}
            icon="check"
            tone="quiet"
            onclick={() => view.runAgentPluginUpdateCheck()}
            disabled={view.agentPluginsLoading || view.agentPluginUpdatesLoading}
          />
          <SettingsActionButton
            label={$t("pluginRefresh")}
            icon="refresh"
            tone="quiet"
            onclick={() => view.reloadAgentPlugins()}
            disabled={view.agentPluginsLoading || view.agentPluginUpdatesLoading}
          />
        </div>
      </div>
      {#if view.agentPluginStatus}
        <div class="provider-status success">{view.agentPluginStatus}</div>
      {/if}
      {#if view.agentPluginUpdateCheckStatus}
        <div class="provider-status {view.agentPluginUpdateCheckStatus.tone}">
          {view.agentPluginUpdateCheckStatus.message}
        </div>
      {/if}
      {#if view.agentPluginMarketplaces.length > 0}
        <section class="plugin-marketplaces" aria-label={$t("pluginMarketplaces")}>
          <div class="plugin-tools-heading">
            <div class="plugin-tools-title">
              <span class="label-text">{$t("pluginMarketplaces")}</span>
              <span class="plugin-tool-count">{view.agentPluginMarketplaces.length}</span>
            </div>
          </div>
          {#each view.agentPluginMarketplaces as marketplace (marketplace.path)}
            <div class="plugin-marketplace-surface plugin-marketplace">
              <div class="plugin-marketplace-heading">
                <div>
                  <span class="label-text">{marketplace.display_name ?? marketplace.name}</span>
                  <span class="detail-hint">{marketplace.path}</span>
                </div>
                <span class="detail-hint">{marketplace.source}</span>
              </div>
              {#if marketplace.error}
                <p class="plugin-warning">{marketplace.error}</p>
              {:else}
                {#each marketplace.plugins as entry (entry.name)}
                  {@const canInstall =
                    entry.source.kind === "local" &&
                    !entry.installed &&
                    !entry.error &&
                    entry.installation !== "NOT_AVAILABLE"}
                  <div class="plugin-marketplace-row">
                    <div class="plugin-marketplace-copy">
                      <span class="label-text">{entry.display_name ?? entry.name}</span>
                      <span class="detail-hint">
                        {entry.category ?? $t("pluginMarketplaceUncategorized")} · {entry.source
                          .kind} ·
                        {entry.installation} · {entry.authentication}
                      </span>
                      {#if entry.error}
                        <span class="plugin-warning">{entry.error}</span>
                      {:else if entry.installed}
                        <span class="detail-hint">{$t("pluginMarketplaceInstalled")}</span>
                      {:else if entry.source.kind !== "local"}
                        <span class="detail-hint"
                          >{$t("pluginMarketplaceSourceInstallerRequired")}</span
                        >
                      {/if}
                    </div>
                    {#if canInstall}
                      <SettingsActionButton
                        label={view.agentPluginInstalling(entry.name)
                          ? $t("pluginOfficialInstalling")
                          : $t("pluginMarketplaceInstall")}
                        icon="download"
                        tone="quiet"
                        onclick={() =>
                          view.installMarketplaceAgentPlugin(marketplace.path, entry.name)}
                        disabled={view.agentPluginInstalling(entry.name) ||
                          view.agentPluginUpdating === entry.name ||
                          view.agentPluginRemoveId === entry.name}
                      />
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        </section>
      {/if}
      {#if view.agentPluginsLoading && view.agentPlugins.length === 0}
        <p class="detail-hint">{$t("pluginLoading")}</p>
      {:else if view.agentPlugins.length === 0}
        <p class="detail-hint">{$t("pluginEmpty")}</p>
      {/if}
      <Accordion.Root type="multiple" class="plugin-accordion">
        {#each view.agentPlugins as plugin (plugin.id)}
          <Accordion.Item
            value={`plugin-${plugin.id}`}
            class="application-settings-surface plugin-accordion-item"
            data-plugin-id={plugin.id}
          >
            <Accordion.Header class="plugin-accordion-header">
              <Accordion.Trigger class="plugin-accordion-trigger">
                <span class="plugin-accordion-copy">
                  <span class="label-text"
                    >{pluginText(plugin.i18n, $locale, "display_name", plugin.name)}</span
                  >
                  <span class="detail-hint"
                    >{pluginText(
                      plugin.i18n,
                      $locale,
                      "description",
                      plugin.description ?? plugin.id,
                    )}</span
                  >
                  <PluginLanguageSupport i18n={plugin.i18n} />
                  {#if plugin.license || plugin.homepage}
                    <span class="detail-hint"
                      >{[plugin.license, plugin.homepage].filter(Boolean).join(" · ")}</span
                    >
                  {/if}
                </span>
                <span class="plugin-version">
                  {plugin.version ?? "-"}
                  {#if (view.agentPluginUpdates ?? []).find((item: AgentPluginUpdateSummary) => item.id === plugin.id)?.update_available}
                    <span class="plugin-update-mark">{$t("pluginUpdateAvailable")}</span>
                  {/if}
                </span>
              </Accordion.Trigger>
              <div class="plugin-accordion-actions">
                <label class="plugin-enable-label" for={`plugin-enable-${plugin.id}`}
                  >{$t("pluginEnable")}</label
                >
                <Switch
                  id={`plugin-enable-${plugin.id}`}
                  checked={view.agentPluginEnabled(plugin.id)}
                  onCheckedChange={(enabled) => view.setAgentPluginEnabled(plugin.id, enabled)}
                  ariaLabel={pluginText(plugin.i18n, $locale, "display_name", plugin.name)}
                />
              </div>
            </Accordion.Header>
            {#if view.pluginRequestsHostAccess(plugin)}
              <div class="plugin-host-access-row">
                <div class="plugin-host-access-copy">
                  <label class="label-text" for={`plugin-host-access-${plugin.id}`}
                    >{$t("pluginHostAccess")}</label
                  >
                  <span class="detail-hint">{$t("pluginHostAccessHint")}</span>
                </div>
                <Switch
                  id={`plugin-host-access-${plugin.id}`}
                  checked={view.agentPluginHostAccess(plugin.id)}
                  onCheckedChange={(granted) => view.setAgentPluginHostAccess(plugin.id, granted)}
                  ariaLabel={$t("pluginHostAccess")}
                />
              </div>
            {/if}
            <Accordion.Content class="plugin-accordion-content">
              {#if plugin.mcp_servers.length > 0}
                <div class="settings-section-heading">
                  <label class="label-text" for={`plugin-mcp-mode-${plugin.id}`}
                    >{$t("pluginMcpToolMode")}</label
                  >
                  <span class="detail-hint">{$t("pluginMcpToolModeHint")}</span>
                </div>
                <Select
                  id={`plugin-mcp-mode-${plugin.id}`}
                  value={view.agentPluginMcpToolMode(plugin.id)}
                  items={[
                    { value: "default", label: $t("pluginMcpToolModeDefault") },
                    { value: "direct", label: $t("pluginMcpToolModeDirect") },
                    { value: "relay", label: $t("pluginMcpToolModeRelay") },
                  ]}
                  ariaLabel={$t("pluginMcpToolMode")}
                  onValueChange={(mode) => view.setAgentPluginMcpToolMode(plugin.id, mode)}
                />
              {/if}
              <div class="plugin-tools-heading">
                <div class="plugin-tools-title">
                  <span class="label-text">{$t("pluginComponents")}</span>
                  <span class="plugin-tool-count"
                    >{plugin.skills.length +
                      plugin.mcp_servers.length +
                      plugin.commands.length +
                      plugin.message_policies.length +
                      plugin.sidebar_views.length}</span
                  >
                </div>
              </div>
              <span class="detail-hint">
                {plugin.skills.length}
                {$t("pluginSkills")} · {plugin.mcp_servers.length}
                {$t("pluginMcpServers")}
                {#if plugin.commands.length > 0}
                  · {plugin.commands.length} {$t("pluginCommands")}{/if}
                {#if plugin.message_policies.length > 0}
                  · {plugin.message_policies.length} {$t("pluginMessagePolicies")}{/if}
                {#if plugin.sidebar_views.length > 0}
                  · {plugin.sidebar_views.length} {$t("pluginSidebarViews")}{/if}
              </span>
              {#each plugin.warnings as warning (warning)}
                <p class="plugin-warning">{warning}</p>
              {/each}
              {#if plugin.error}
                <p class="plugin-warning">{plugin.error}</p>
              {/if}
              {#if plugin.sidebar_views.length > 0}
                <div class="plugin-sidebar-views">
                  <span class="label-text">{$t("pluginSidebarViews")}</span>
                  {#each plugin.sidebar_views as sidebarView (sidebarView.id)}
                    {@const lifecycle = view.pluginSidebarLifecycleFor(plugin, sidebarView)}
                    <div class="plugin-sidebar-view-row">
                      <span class="plugin-sidebar-view-copy">
                        <span class="label-text">{sidebarView.title}</span>
                        {#if lifecycle !== "available"}
                          <span class="detail-hint">
                            {lifecycle === "disabled"
                              ? $t("pluginSidebarDisabled")
                              : lifecycle === "invalid"
                                ? $t("pluginSidebarInvalid")
                                : $t("pluginSidebarOutOfScope")}
                          </span>
                        {/if}
                      </span>
                      {#if view.onOpenPluginSidebarView}
                        <SettingsActionButton
                          label={$t("pluginSidebarOpen")}
                          tone="quiet"
                          disabled={lifecycle !== "available"}
                          onclick={() => view.onOpenPluginSidebarView(sidebarView.id)}
                        />
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
              {@const update = (view.agentPluginUpdates ?? []).find(
                (item: AgentPluginUpdateSummary) => item.id === plugin.id,
              )}
              {#if (update?.update_available && update.latest_version) || !plugin.builtin || plugin.repository || update?.error}
                <div class="plugin-accordion-footer">
                  {#if plugin.repository}
                    <a href={plugin.repository} target="_blank" rel="noreferrer">GitHub</a>
                  {/if}
                  {#if update?.error}
                    <!-- The reason, so a quota or a manifest problem is not
                         silently counted as a broken package. The raw
                         diagnostic from the update check stays underneath it
                         rather than standing in for the explanation. -->
                    {@const reasonKey = agentPluginUpdateErrorKey(update.error_kind)}
                    <p class="plugin-warning">
                      {#if update.stale}
                        {$t("pluginUpdateStaleHint")}
                      {/if}
                      {reasonKey === null ? update.error : $t(reasonKey)}
                    </p>
                    {#if reasonKey !== null}
                      <p class="detail-hint">{update.error}</p>
                    {/if}
                  {/if}
                  {#if update?.update_available && update.latest_version}
                    <p class="plugin-update-hint">
                      {$t("pluginLatestVersion").replace("{version}", update.latest_version)}
                      {#if update.release_url}
                        <a href={update.release_url} target="_blank" rel="noreferrer">GitHub</a>
                      {/if}
                      {#if update.asset_url}
                        <SettingsActionButton
                          label={$t("pluginUpdate")}
                          icon="download"
                          tone="quiet"
                          onclick={() => view.updateAgentPlugin(plugin.id)}
                          disabled={view.agentPluginUpdating !== null ||
                            view.agentPluginInstalling(plugin.id)}
                        />
                      {/if}
                    </p>
                  {/if}
                  {#if !plugin.builtin}
                    <SettingsActionButton
                      label={$t("pluginUninstall")}
                      icon="trash"
                      tone="danger"
                      onclick={() => view.requestUninstallAgentPlugin(plugin.id)}
                      disabled={view.agentPluginUpdating !== null ||
                        view.agentPluginRemoving ||
                        view.agentPluginInstalling(plugin.id)}
                    />
                  {/if}
                </div>
              {/if}
            </Accordion.Content>
          </Accordion.Item>
        {/each}
      </Accordion.Root>
    {/if}
  </ScrollArea>
</Tabs.Content>

<Tabs.Content value="execution" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("approvalMode")}</h4>
      <div class="application-settings-surface settings-card">
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text"
              >{$t(
                approvalModeDescriptionKey[
                  view.draftConfig.approval_mode as keyof typeof approvalModeDescriptionKey
                ],
              )}</span
            >
            <span class="detail-hint">{$t("approvalPermissionIndependent")}</span>
          </span>
          <div class="settings-card-control">
            <Select
              bind:value={view.draftConfig.approval_mode}
              items={[
                {
                  value: "manual",
                  label: $t("approvalModeManual"),
                  description: $t("approvalModeManualDescription"),
                },
                {
                  value: "auto",
                  label: $t("approvalModeAuto"),
                  description: $t("approvalModeAutoDescription"),
                },
                {
                  value: "off",
                  label: $t("approvalModeOff"),
                  description: $t("approvalModeOffDescription"),
                },
              ]}
              ariaLabel={$t("approvalMode")}
            />
          </div>
        </div>
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("executionPermissions")}</h4>
      <p class="detail-section-intro">{$t("executionPermissionsDescription")}</p>
      <PermissionSettings
        profile={view.permissionProfile}
        onProfileChange={(profile) => (view.draftConfig.permission_profile = profile)}
      />
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("agentExecution")}</h4>
      <div class="execution-settings">
        <div class="application-settings-surface execution-setting">
          <div class="startup-row execution-toggle-row">
            <div class="startup-copy">
              <span class="label-text">{$t("agentTurnLimit")}</span>
              <p class="detail-hint">{$t("agentTurnLimitHint")}</p>
            </div>
            <Switch
              bind:checked={view.draftConfig.agent_turn_limit_enabled}
              ariaLabel={$t("agentTurnLimit")}
            />
          </div>
          <label class="execution-value-row">
            <span class="settings-card-copy">
              <span class="label-text">{$t("agentMaxTurns")}</span>
              <span class="detail-hint">{$t("agentMaxTurnsHint")}</span>
            </span>
            <input
              type="number"
              class="detail-input settings-card-number-input"
              min="1"
              max="1000"
              step="1"
              disabled={!view.draftConfig.agent_turn_limit_enabled}
              bind:value={view.draftConfig.agent_max_turns}
            />
          </label>
        </div>
      </div>
    </section>
  </ScrollArea>
</Tabs.Content>

<Tabs.Content value="channels" class="settings-tab-panel">
  <div class="channel-settings-layout">
    <nav class="channel-settings-list" aria-label={$t("channels")}>
      <div class="channel-settings-list-items">
        <button
          type="button"
          class:active={view.channelSettingsNav === "feishu"}
          class="channel-settings-item"
          onclick={() => (view.channelSettingsNav = "feishu")}
        >
          <span class="channel-settings-icon feishu" aria-hidden="true">
            <img src="/assets/channels/feishu.jpeg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("feishuChannel")}</strong><span>{$t("feishuChannelSubtitle")}</span></span
          >
        </button>
        <button
          type="button"
          class:active={view.channelSettingsNav === "telegram"}
          class="channel-settings-item"
          onclick={() => (view.channelSettingsNav = "telegram")}
        >
          <span class="channel-settings-icon telegram" aria-hidden="true">
            <img src="/assets/channels/telegram.png" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("telegramChannel")}</strong><span>{$t("telegramChannelSubtitle")}</span
            ></span
          >
        </button>
        <button
          type="button"
          class:active={view.channelSettingsNav === "qq"}
          class="channel-settings-item"
          onclick={() => (view.channelSettingsNav = "qq")}
        >
          <span class="channel-settings-icon qq" aria-hidden="true">
            <img src="/assets/channels/qq.svg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("qqChannel")}</strong><span>{$t("qqChannelSubtitle")}</span></span
          >
        </button>
        <button
          type="button"
          class:active={view.channelSettingsNav === "wechat"}
          class="channel-settings-item"
          onclick={() => (view.channelSettingsNav = "wechat")}
        >
          <span class="channel-settings-icon wechat" aria-hidden="true">
            <img src="/assets/channels/wechat.png" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("wechatChannel")}</strong><span>{$t("wechatChannelSubtitle")}</span></span
          >
        </button>
        <button
          type="button"
          class:active={view.channelSettingsNav === "discord"}
          class="channel-settings-item"
          onclick={() => (view.channelSettingsNav = "discord")}
        >
          <span class="channel-settings-icon discord" aria-hidden="true">
            <img src="/assets/channels/discord.svg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("discordChannel")}</strong><span>{$t("discordChannelSubtitle")}</span
            ></span
          >
        </button>
        <button
          type="button"
          class:active={view.channelSettingsNav === "slack"}
          class="channel-settings-item"
          onclick={() => (view.channelSettingsNav = "slack")}
        >
          <span class="channel-settings-icon slack" aria-hidden="true">
            <img src="/assets/channels/slack.svg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("slackChannel")}</strong><span>{$t("slackChannelSubtitle")}</span></span
          >
        </button>
        <button
          type="button"
          class:active={view.channelSettingsNav === "gateway"}
          class="channel-settings-item"
          onclick={() => (view.channelSettingsNav = "gateway")}
        >
          <span class="channel-settings-icon gateway" aria-hidden="true">
            <img src="/assets/channels/gateway.svg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("remoteGateway")}</strong><span>{$t("remoteGatewaySubtitle")}</span></span
          >
        </button>
      </div>
    </nav>
    <ScrollArea
      height="100%"
      class="settings-content-col channel-settings-detail"
      scrollHideDelay={350}
    >
      {#if view.channelSettingsNav === "feishu"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("feishuChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("feishuChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.channels!.feishu!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label">
              <span class="label-text">{$t("channelAppId")}</span>
              <input class="detail-input" bind:value={view.draftConfig.channels!.feishu!.app_id} />
            </label>
            <label class="detail-label">
              <span class="label-text">{$t("channelAppSecret")}</span>
              <input
                type="password"
                class="detail-input"
                bind:value={view.draftConfig.channels!.feishu!.app_secret}
              />
            </label>
            <div class="detail-label">
              <span class="label-text">{$t("feishuDomain")}</span>
              <Select
                bind:value={view.draftConfig.channels!.feishu!.domain}
                items={[
                  { value: "feishu", label: $t("feishuDomainChina") },
                  { value: "lark", label: $t("feishuDomainInternational") },
                ]}
                ariaLabel={$t("feishuDomain")}
              />
            </div>
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedChatIds")}</span>
              <SettingsListInput
                value={view.draftConfig.channels!.feishu!.allowed_chat_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (view.draftConfig.channels!.feishu!.allowed_chat_ids =
                    view.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if view.channelStatuses.feishu?.error}
            <div class="provider-status error">{view.channelStatuses.feishu.error}</div>
          {/if}
        </section>
      {:else if view.channelSettingsNav === "telegram"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("telegramChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("telegramChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.channels!.telegram!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label">
              <span class="label-text">{$t("channelBotToken")}</span>
              <input
                type="password"
                class="detail-input"
                bind:value={view.draftConfig.channels!.telegram!.bot_token}
              />
            </label>
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedChatIds")}</span>
              <SettingsListInput
                value={view.draftConfig.channels!.telegram!.allowed_chat_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (view.draftConfig.channels!.telegram!.allowed_chat_ids =
                    view.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if view.channelStatuses.telegram?.error}<div class="provider-status error">
              {view.channelStatuses.telegram.error}
            </div>{/if}
        </section>
      {:else if view.channelSettingsNav === "qq"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("qqChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("qqChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.channels!.qq!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label"
              ><span class="label-text">{$t("channelAppId")}</span><input
                class="detail-input"
                bind:value={view.draftConfig.channels!.qq!.app_id}
              /></label
            >
            <label class="detail-label"
              ><span class="label-text">{$t("channelClientSecret")}</span><input
                type="password"
                class="detail-input"
                bind:value={view.draftConfig.channels!.qq!.client_secret}
              /></label
            >
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedUserIds")}</span>
              <SettingsListInput
                value={view.draftConfig.channels!.qq!.allowed_user_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (view.draftConfig.channels!.qq!.allowed_user_ids = view.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if view.channelStatuses.qq?.error}<div class="provider-status error">
              {view.channelStatuses.qq.error}
            </div>{/if}
        </section>
      {:else if view.channelSettingsNav === "discord"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("discordChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("discordChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.channels!.discord!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label"
              ><span class="label-text">{$t("channelBotToken")}</span><input
                type="password"
                class="detail-input"
                bind:value={view.draftConfig.channels!.discord!.bot_token}
              /></label
            >
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedChannelIds")}</span>
              <SettingsListInput
                value={view.draftConfig.channels!.discord!.allowed_channel_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (view.draftConfig.channels!.discord!.allowed_channel_ids =
                    view.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if view.channelStatuses.discord?.error}<div class="provider-status error">
              {view.channelStatuses.discord.error}
            </div>{/if}
        </section>
      {:else if view.channelSettingsNav === "slack"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("slackChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("slackChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.channels!.slack!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label"
              ><span class="label-text">{$t("slackBotToken")}</span><input
                type="password"
                class="detail-input"
                bind:value={view.draftConfig.channels!.slack!.bot_token}
              /></label
            >
            <label class="detail-label"
              ><span class="label-text">{$t("slackAppToken")}</span><input
                type="password"
                class="detail-input"
                bind:value={view.draftConfig.channels!.slack!.app_token}
              /></label
            >
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedChannelIds")}</span>
              <SettingsListInput
                value={view.draftConfig.channels!.slack!.allowed_channel_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (view.draftConfig.channels!.slack!.allowed_channel_ids =
                    view.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if view.channelStatuses.slack?.error}<div class="provider-status error">
              {view.channelStatuses.slack.error}
            </div>{/if}
        </section>
      {:else if view.channelSettingsNav === "wechat"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("wechatChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("wechatChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.channels!.wechat.enabled}
              ariaLabel={$t("wechatChannelEnabled")}
            />
          </div>
          <div class="application-settings-surface remote-gateway-card">
            <div class="wechat-channel-access">
              <label class="label-text" for="wechat-allowed-users"
                >{$t("wechatChannelAllowedUsers")}</label
              >
              <p class="detail-hint">{$t("wechatChannelAllowedUsersHint")}</p>
              <SettingsListInput
                id="wechat-allowed-users"
                value={view.draftConfig.channels!.wechat.allowed_user_ids.join("\n")}
                placeholder={$t("wechatChannelAllowedUsersPlaceholder")}
                oninput={(value) =>
                  (view.draftConfig.channels!.wechat.allowed_user_ids =
                    view.parseChannelIds(value))}
              />
            </div>
          </div>
          {#if view.draftConfig.channels!.wechat.enabled && view.wechatChannelStatus?.state === "awaiting_scan" && view.wechatChannelStatus.qr_image_data_url}
            <div class="application-settings-surface wechat-qr-card">
              <img
                src={view.wechatChannelStatus.qr_image_data_url}
                alt={$t("wechatChannelQrAlt")}
              />
              <div>
                <strong>{$t("wechatChannelScanTitle")}</strong>
                <p class="detail-hint">{$t("wechatChannelScanHint")}</p>
              </div>
            </div>
          {:else if view.draftConfig.channels!.wechat.enabled && view.wechatChannelStatus?.state === "connected"}
            <div class="application-settings-surface wechat-connected-card">
              <div>
                <span class="remote-credential-label">{$t("wechatChannelAccount")}</span><code
                  >{view.wechatChannelStatus.account_id}</code
                >
              </div>
              <button
                class="remote-credential-action"
                disabled={view.wechatChannelBusy}
                onclick={view.reconnectWechatChannel}>{$t("wechatChannelReconnect")}</button
              >
            </div>
          {/if}
          {#if view.wechatChannelStatus?.error || view.wechatChannelMessage}<div
              class="provider-status"
              style="margin-top:8px"
            >
              {view.wechatChannelMessage || view.wechatChannelStatus?.error}
            </div>{/if}
        </section>
      {:else}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("remoteGateway")}</h4>
              <p class="remote-gateway-subtitle">{$t("remoteGatewaySubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={view.draftConfig.remote_gateway.enabled}
              ariaLabel={$t("remoteGatewayEnabled")}
            />
          </div>
          <div class="application-settings-surface remote-gateway-card">
            <div class="remote-gateway-toggle-row remote-gateway-workspace-row">
              <div class="remote-gateway-icon workspace" aria-hidden="true">LAN</div>
              <div class="startup-copy">
                <span class="label-text">{$t("remoteGatewayLanAccess")}</span>
                <p class="detail-hint">{$t("remoteGatewayLanAccessHint")}</p>
              </div>
              <Switch
                bind:checked={view.draftConfig.remote_gateway.allow_lan_access}
                ariaLabel={$t("remoteGatewayLanAccess")}
              />
            </div>
            <div class="remote-gateway-toggle-row remote-gateway-workspace-row">
              <div class="remote-gateway-icon workspace" aria-hidden="true">⌂</div>
              <div class="startup-copy">
                <span class="label-text">{$t("remoteGatewayCurrentWorkspace")}</span>
                <p class="detail-hint remote-workspace-path">
                  {view.workspacePath || $t("noWorkspace")}
                </p>
              </div>
              <Switch
                checked={Boolean(view.workspacePath) &&
                  view.draftConfig.remote_gateway.allowed_workspaces.includes(view.workspacePath)}
                disabled={!view.workspacePath}
                onCheckedChange={view.toggleCurrentWorkspaceAccess}
                ariaLabel={$t("remoteGatewayCurrentWorkspace")}
              />
            </div>
          </div>
          {#if view.draftConfig.remote_gateway.enabled && view.remoteGatewayStatus}
            <div class="application-settings-surface remote-gateway-credentials">
              <div class="remote-credential-row">
                <div class="remote-credential-copy">
                  <span class="remote-credential-label">{$t("remoteGatewayLocalUrl")}</span><code
                    >{view.remoteGatewayStatus.url}</code
                  >
                </div>
                <button
                  class="remote-credential-action"
                  onclick={() =>
                    view.copyRemoteGatewayValue(view.remoteGatewayStatus?.url ?? "", "url")}
                  >{view.copiedRemoteValue === "url"
                    ? $t("remoteGatewayCopied")
                    : $t("copy")}</button
                >
              </div>
              {#if view.draftConfig.remote_gateway.allow_lan_access && view.remoteGatewayStatus.lan_url}<div
                  class="remote-credential-row"
                >
                  <div class="remote-credential-copy">
                    <span class="remote-credential-label">{$t("remoteGatewayLanUrl")}</span><code
                      >{view.remoteGatewayStatus.lan_url}</code
                    >
                  </div>
                  <button
                    class="remote-credential-action"
                    onclick={() =>
                      view.copyRemoteGatewayValue(view.remoteGatewayStatus?.lan_url ?? "", "lan")}
                    >{view.copiedRemoteValue === "lan"
                      ? $t("remoteGatewayCopied")
                      : $t("copy")}</button
                  >
                </div>{/if}
              <div class="remote-credential-row pairing">
                <div class="remote-credential-copy">
                  <span class="remote-credential-label">{$t("remoteGatewayPairingCode")}</span><code
                    >{view.remoteGatewayStatus.pairing_code}</code
                  >
                </div>
                <div class="remote-credential-actions">
                  <button
                    class="remote-credential-action"
                    onclick={() =>
                      view.copyRemoteGatewayValue(
                        view.remoteGatewayStatus?.pairing_code ?? "",
                        "code",
                      )}
                    >{view.copiedRemoteValue === "code"
                      ? $t("remoteGatewayCopied")
                      : $t("copy")}</button
                  ><button
                    class="remote-credential-action primary"
                    disabled={view.remoteGatewayBusy}
                    onclick={view.rotateRemotePairingCode}>{$t("remoteGatewayRotate")}</button
                  >
                </div>
              </div>
              <div class="remote-security-note">
                <span aria-hidden="true">⌁</span>
                <p>{$t("remoteGatewayProxyHint")}</p>
              </div>
            </div>
          {/if}
          {#if view.remoteGatewayMessage}<div class="provider-status" style="margin-top:8px">
              {view.remoteGatewayMessage}
            </div>{/if}
        </section>
      {/if}
    </ScrollArea>
  </div>
</Tabs.Content>

<Tabs.Content value="memory" class="settings-tab-panel management-tab-panel">
  <div class="memory-management-layout">
    <div class="memory-toolbar">
      <div class="memory-scope-control">
        <fieldset
          class="memory-scope-options"
          disabled={view.memoryLoading || view.memorySaving || view.memoryBusy || view.memoryDirty}
        >
          <SegmentedControl
            fitContent
            value={view.memoryScope}
            onValueChange={(value) => (view.memoryScope = value)}
            items={[
              { value: "global", label: $t("globalTab") },
              { value: "local", label: $t("projectTab") },
            ]}
            ariaLabel={$t("scope")}
          />
        </fieldset>
        <p class="detail-hint">
          {view.memoryDirty
            ? $t("memoryUnsavedHint")
            : view.memoryScope === "local" && !view.workspacePath
              ? $t("memoryNoWorkspace")
              : $t("memoryScopeHint")}
        </p>
      </div>
      <div class="memory-heading-actions">
        <SettingsActionButton
          label={$t("memoryRefresh")}
          icon="refresh"
          tone="quiet"
          onclick={() => view.refreshMemory()}
          disabled={view.memoryLoading || view.memorySaving || view.memoryBusy}
        />
      </div>
    </div>
    <div class="management-columns memory-columns">
      <section class="management-pane memory-user-pane">
        <ScrollArea height="100%" class="memory-user-scroll" scrollHideDelay={350}>
          <div class="memory-editor-body">
            <div class="detail-section-heading">
              <h4 class="detail-section-title">{$t("userMemory")}</h4>
              <p class="detail-section-intro">{$t("memoryEditHint")}</p>
            </div>
            <textarea
              class="detail-input memory-editor"
              bind:value={view.memoryUserContent}
              disabled={!view.memoryLoaded ||
                view.memoryLoading ||
                view.memorySaving ||
                view.memoryBusy ||
                !view.memoryScopeAvailable()}
              aria-label={$t("userMemory")}
              placeholder={$t("memoryEditHint")}></textarea>
          </div>
        </ScrollArea>
        <div class="memory-editor-footer">
          <span class="memory-count" role="status"
            >{view.memoryLoading
              ? $t("loadingContent")
              : !view.memoryLoaded
                ? ""
                : view.memoryDirty
                  ? $t("memoryUnsaved")
                  : $t("memorySaved")}</span
          >
          <div class="memory-heading-actions">
            {#if view.memoryDirty}
              <SettingsActionButton
                label={$t("memoryDiscard")}
                tone="quiet"
                onclick={view.discardMemoryDraft}
                disabled={view.memoryLoading || view.memorySaving || view.memoryBusy}
              />
            {/if}
            <SettingsActionButton
              label={view.memorySaving ? $t("memorySaving") : $t("save")}
              icon="check"
              tone="primary"
              onclick={view.saveUserMemory}
              disabled={!view.memoryDirty ||
                view.memorySaving ||
                view.memoryLoading ||
                view.memoryBusy ||
                !view.memoryScopeAvailable()}
            />
          </div>
        </div>
      </section>
      <ScrollArea height="100%" class="memory-agent-scroll" scrollHideDelay={350}>
        <section class="management-pane memory-agent-pane">
          <div class="detail-section-header">
            <div class="detail-section-heading">
              <h4 class="detail-section-title">{$t("agentMemory")}</h4>
              <p class="detail-section-intro">{$t("agentMemoryHint")}</p>
            </div>
            <span class="memory-count"
              >{$t("memoryAgentCount").replace(
                "{count}",
                String(view.memoryAgentEntries.length),
              )}</span
            >
          </div>
          <input
            class="detail-input memory-search"
            bind:value={view.memoryAgentSearch}
            oninput={view.searchAgentMemories}
            disabled={view.memoryLoading || !view.memoryScopeAvailable()}
            placeholder={$t("memorySearchPlaceholder")}
            aria-label={$t("memorySearchPlaceholder")}
          />
          <div class="memory-agent-list" aria-busy={view.memoryLoading || view.memoryAgentLoading}>
            {#if view.memoryLoading || view.memoryAgentLoading}
              <LoadingSkeleton variant="detail-list" rows={4} label={$t("loadingContent")} />
            {:else if view.memoryAgentEntries.length === 0}
              <div class="model-list-empty">
                {view.memoryAgentSearch.trim() ? $t("memorySearchEmpty") : $t("agentMemoryEmpty")}
              </div>
            {:else}
              {#each view.memoryAgentEntries as entry (entry.id)}
                <article class="memory-agent-item">
                  <p class="memory-agent-content">{entry.content}</p>
                  <div class="memory-agent-meta">
                    <span
                      >{$t("memoryUpdatedAt").replace(
                        "{date}",
                        view.formatMemoryDate(entry.updated_at),
                      )}</span
                    >
                    {#if entry.source_conv_id}
                      <button
                        class="memory-source-button"
                        type="button"
                        onclick={() => view.onOpenConversation(entry.source_conv_id!)}
                        >{$t("memorySource")}</button
                      >
                    {:else}
                      <span>{$t("memoryNoSource")}</span>
                    {/if}
                    <SettingsActionButton
                      label={$t("deleteMemory")}
                      icon="trash"
                      tone="danger"
                      onclick={() => view.removeAgentMemory(entry)}
                      disabled={view.memoryBusy}
                    />
                  </div>
                </article>
              {/each}
            {/if}
          </div>
        </section>
      </ScrollArea>
    </div>
    <Accordion.Root type="single" class="memory-maintenance">
      <Accordion.Item value="backup" class="memory-maintenance-item">
        <Accordion.Header class="memory-maintenance-header">
          <Accordion.Trigger class="memory-maintenance-trigger">
            <span>{$t("memoryMaintenance")}</span>
            <span aria-hidden="true" class="memory-maintenance-chevron">⌄</span>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>
          <ScrollArea height="180px" class="memory-maintenance-scroll" scrollHideDelay={350}>
            <section class="detail-section">
              <h4 class="detail-section-title">{$t("memoryBackup")}</h4>
              <div class="memory-action-grid">
                <SettingsActionButton
                  label={$t("exportMemory")}
                  icon="download"
                  onclick={view.exportMemory}
                  disabled={view.memoryBusy ||
                    view.memorySaving ||
                    view.memoryLoading ||
                    view.memoryDirty ||
                    !view.memoryScopeAvailable()}
                />
                <SettingsActionButton
                  label={$t("importMemoryMerge")}
                  icon="merge"
                  onclick={() => view.importMemory(false)}
                  disabled={view.memoryBusy ||
                    view.memorySaving ||
                    view.memoryLoading ||
                    view.memoryDirty ||
                    !view.memoryScopeAvailable()}
                />
                <SettingsActionButton
                  label={$t("importMemoryReplace")}
                  icon="replace"
                  onclick={() => view.importMemory(true)}
                  disabled={view.memoryBusy ||
                    view.memorySaving ||
                    view.memoryLoading ||
                    view.memoryDirty ||
                    !view.memoryScopeAvailable()}
                />
              </div>
            </section>

            <section class="application-settings-surface detail-section danger-zone">
              <div>
                <p class="danger-title">{$t("clearMemory")}</p>
                <p class="danger-copy">{$t("clearMemoryDesc")}</p>
              </div>
              <SettingsActionButton
                label={$t("clearMemory")}
                icon="trash"
                tone="danger"
                onclick={view.clearMemoryScope}
                disabled={view.memoryBusy ||
                  view.memorySaving ||
                  view.memoryLoading ||
                  view.memoryDirty ||
                  !view.memoryScopeAvailable()}
              />
            </section>
          </ScrollArea>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
    {#if view.memoryStatus}
      <div
        role="status"
        aria-live="polite"
        class="management-status provider-status {view.memoryStatus.includes(
          tr('memoryOperationFailed'),
        )
          ? 'error'
          : 'success'}"
      >
        {view.memoryStatus}
      </div>
    {/if}
  </div>
</Tabs.Content>
