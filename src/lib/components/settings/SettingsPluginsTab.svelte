<script lang="ts">
  import { Accordion, Tabs } from "bits-ui";
  import type { AgentPluginUpdateSummary } from "$lib/types";
  import { agentPluginUpdateErrorKey } from "$lib/agentPluginUpdateCheck";
  import { desktopPluginInstallQueue, type PluginInstallTask } from "$lib/agentPluginInstallQueue";
  import PluginInstallNotice from "../PluginInstallNotice.svelte";
  import PluginLanguageSupport from "../PluginLanguageSupport.svelte";
  import { pluginText } from "$lib/pluginI18n";
  import type { OfficialPluginCatalogItem } from "$lib/officialPluginRegistry";
  import { t, locale } from "$lib/i18n";
  import Select from "../ui/Select.svelte";
  import SegmentedControl from "../ui/SegmentedControl.svelte";
  import Switch from "../ui/Switch.svelte";
  import SettingsActionButton from "../ui/SettingsActionButton.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { plugins, options } = useSettingsContext();
</script>

<Tabs.Content value="plugins" class="settings-tab-panel">
  <ScrollArea
    height="100%"
    class="settings-content-col plugin-management-content"
    scrollHideDelay={350}
  >
    <header class="agents-settings-intro plugin-management-header">
      <h3>{$t("plugins")}</h3>
      <SegmentedControl
        class="plugin-management-tabs"
        fitContent
        tabs
        ariaLabel={$t("plugins")}
        value={plugins.pluginManagementView}
        items={[
          { value: "marketplace", label: $t("pluginMarketplaceTab") },
          { value: "installed", label: $t("pluginInstalledTab") },
        ]}
        onValueChange={(value) => (plugins.pluginManagementView = value)}
      />
    </header>
    {#each plugins.agentPluginInstallTasks as task (task.key)}
      {#if task.status !== "running" || plugins.pluginManagementView !== "marketplace" || !plugins.officialPluginCards.some((plugin: OfficialPluginCatalogItem) => plugin.id === task.pluginId)}
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
            <progress aria-label={`${task.label} · ${plugins.agentPluginInstallMessage(task)}`}
            ></progress>
            <span>{task.label} · {plugins.agentPluginInstallMessage(task)}</span>
          </div>
        {:else}
          <PluginInstallNotice
            {task}
            message={plugins.agentPluginInstallMessage(task)}
            ondismiss={() => desktopPluginInstallQueue.dismiss(task.key)}
          />
        {/if}
      {/if}
    {/each}
    {#if plugins.pluginManagementView === "marketplace"}
      <section class="official-plugin-store" aria-label={$t("pluginOfficialMarketplace")}>
        <div class="official-plugin-store-toolbar">
          <label class="official-plugin-search">
            <span class="sr-only">{$t("pluginOfficialSearch")}</span>
            <input
              class="detail-input"
              type="search"
              placeholder={$t("pluginOfficialSearchPlaceholder")}
              bind:value={plugins.officialPluginQuery}
            />
          </label>
          {#if plugins.officialPluginQuery}
            <button
              type="button"
              class="official-plugin-clear"
              onclick={() => (plugins.officialPluginQuery = "")}
            >
              {$t("pluginOfficialClearSearch")}
            </button>
          {/if}
          <SegmentedControl
            class="official-plugin-filters"
            fitContent
            tabs
            ariaLabel={$t("pluginOfficialFilter")}
            value={plugins.officialPluginFilter}
            items={[
              { value: "all", label: $t("pluginOfficialFilterAll") },
              { value: "available", label: $t("pluginOfficialFilterAvailable") },
              { value: "installed", label: $t("pluginOfficialFilterInstalled") },
            ]}
            onValueChange={(value) => (plugins.officialPluginFilter = value)}
          />
        </div>
        {#if plugins.officialPluginCards.length > 0}
          <div class="official-plugin-grid">
            {#each plugins.officialPluginCards as plugin (plugin.id)}
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
                  {#each plugins.agentPluginInstallTasks.filter((task: PluginInstallTask) => task.pluginId === plugin.id && task.status === "running") as task (task.key)}
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
                        aria-label={`${task.label} · ${plugins.agentPluginInstallMessage(task)}`}
                      ></progress>
                      <span>{plugins.agentPluginInstallMessage(task)}</span>
                    </div>
                  {/each}
                  {#if plugin.installed && plugin.updateAvailable}
                    <SettingsActionButton
                      label={$t("pluginUpdate")}
                      icon="download"
                      tone="primary"
                      onclick={() => plugins.updateAgentPlugin(plugin.id)}
                      disabled={plugins.agentPluginUpdating !== null}
                    />
                  {:else if plugin.installed}
                    <span class="official-plugin-installed-copy"
                      >{$t("pluginOfficialInstalled")}</span
                    >
                  {:else}
                    <SettingsActionButton
                      label={plugins.agentPluginInstalling(plugin.id)
                        ? $t("pluginOfficialInstalling")
                        : $t("pluginMarketplaceInstall")}
                      icon="download"
                      tone="primary"
                      onclick={() => plugins.installOfficialAgentPlugin(plugin)}
                      disabled={plugins.agentPluginInstalling(plugin.id) ||
                        plugins.agentPluginUpdating === plugin.id ||
                        plugins.agentPluginRemoveId === plugin.id}
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
          <span class="plugin-directory-count">{plugins.agentPlugins.length}</span>
        </div>
        <div class="plugin-directory-actions">
          <SettingsActionButton
            label={$t("pluginInstall")}
            icon="add"
            onclick={() => plugins.installAgentPlugin()}
          />
          <SettingsActionButton
            label={plugins.agentPluginUpdatesLoading
              ? $t("pluginCheckingUpdates")
              : $t("pluginCheckUpdates")}
            icon="check"
            tone="quiet"
            onclick={() => plugins.runAgentPluginUpdateCheck()}
            disabled={plugins.agentPluginsLoading || plugins.agentPluginUpdatesLoading}
          />
          <SettingsActionButton
            label={$t("pluginRefresh")}
            icon="refresh"
            tone="quiet"
            onclick={() => plugins.reloadAgentPlugins()}
            disabled={plugins.agentPluginsLoading || plugins.agentPluginUpdatesLoading}
          />
        </div>
      </div>
      {#if plugins.agentPluginStatus}
        <div class="provider-status success">{plugins.agentPluginStatus}</div>
      {/if}
      {#if plugins.agentPluginUpdateCheckStatus}
        <div class="provider-status {plugins.agentPluginUpdateCheckStatus.tone}">
          {plugins.agentPluginUpdateCheckStatus.message}
        </div>
      {/if}
      {#if plugins.agentPluginMarketplaces.length > 0}
        <section class="plugin-marketplaces" aria-label={$t("pluginMarketplaces")}>
          <div class="plugin-tools-heading">
            <div class="plugin-tools-title">
              <span class="label-text">{$t("pluginMarketplaces")}</span>
              <span class="plugin-tool-count">{plugins.agentPluginMarketplaces.length}</span>
            </div>
          </div>
          {#each plugins.agentPluginMarketplaces as marketplace (marketplace.path)}
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
                        label={plugins.agentPluginInstalling(entry.name)
                          ? $t("pluginOfficialInstalling")
                          : $t("pluginMarketplaceInstall")}
                        icon="download"
                        tone="quiet"
                        onclick={() =>
                          plugins.installMarketplaceAgentPlugin(marketplace.path, entry.name)}
                        disabled={plugins.agentPluginInstalling(entry.name) ||
                          plugins.agentPluginUpdating === entry.name ||
                          plugins.agentPluginRemoveId === entry.name}
                      />
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        </section>
      {/if}
      {#if plugins.agentPluginsLoading && plugins.agentPlugins.length === 0}
        <p class="detail-hint">{$t("pluginLoading")}</p>
      {:else if plugins.agentPlugins.length === 0}
        <p class="detail-hint">{$t("pluginEmpty")}</p>
      {/if}
      <Accordion.Root type="multiple" class="plugin-accordion">
        {#each plugins.agentPlugins as plugin (plugin.id)}
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
                  {#if (plugins.agentPluginUpdates ?? []).find((item: AgentPluginUpdateSummary) => item.id === plugin.id)?.update_available}
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
                  checked={plugins.agentPluginEnabled(plugin.id)}
                  onCheckedChange={(enabled) => plugins.setAgentPluginEnabled(plugin.id, enabled)}
                  ariaLabel={pluginText(plugin.i18n, $locale, "display_name", plugin.name)}
                />
              </div>
            </Accordion.Header>
            {#if plugins.pluginRequestsHostAccess(plugin)}
              <div class="plugin-host-access-row">
                <div class="plugin-host-access-copy">
                  <label class="label-text" for={`plugin-host-access-${plugin.id}`}
                    >{$t("pluginHostAccess")}</label
                  >
                  <span class="detail-hint">{$t("pluginHostAccessHint")}</span>
                </div>
                <Switch
                  id={`plugin-host-access-${plugin.id}`}
                  checked={plugins.agentPluginHostAccess(plugin.id)}
                  onCheckedChange={(granted) =>
                    plugins.setAgentPluginHostAccess(plugin.id, granted)}
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
                  value={plugins.agentPluginMcpToolMode(plugin.id)}
                  items={[
                    { value: "default", label: $t("pluginMcpToolModeDefault") },
                    { value: "direct", label: $t("pluginMcpToolModeDirect") },
                    { value: "relay", label: $t("pluginMcpToolModeRelay") },
                  ]}
                  ariaLabel={$t("pluginMcpToolMode")}
                  onValueChange={(mode) => plugins.setAgentPluginMcpToolMode(plugin.id, mode)}
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
                    {@const lifecycle = plugins.pluginSidebarLifecycleFor(plugin, sidebarView)}
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
                      {#if options.onOpenPluginSidebarView}
                        <SettingsActionButton
                          label={$t("pluginSidebarOpen")}
                          tone="quiet"
                          disabled={lifecycle !== "available"}
                          onclick={() => options.onOpenPluginSidebarView?.(sidebarView.id)}
                        />
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
              {@const update = (plugins.agentPluginUpdates ?? []).find(
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
                          onclick={() => plugins.updateAgentPlugin(plugin.id)}
                          disabled={plugins.agentPluginUpdating !== null ||
                            plugins.agentPluginInstalling(plugin.id)}
                        />
                      {/if}
                    </p>
                  {/if}
                  {#if !plugin.builtin}
                    <SettingsActionButton
                      label={$t("pluginUninstall")}
                      icon="trash"
                      tone="danger"
                      onclick={() => plugins.requestUninstallAgentPlugin(plugin.id)}
                      disabled={plugins.agentPluginUpdating !== null ||
                        plugins.agentPluginRemoving ||
                        plugins.agentPluginInstalling(plugin.id)}
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
