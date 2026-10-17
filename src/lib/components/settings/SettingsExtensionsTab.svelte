<script lang="ts">
  import { ContextMenu, Tabs } from "bits-ui";
  import { t, locale } from "$lib/i18n";
  import { pluginText } from "$lib/pluginI18n";
  import Select from "../ui/Select.svelte";
  import Switch from "../ui/Switch.svelte";
  import SettingsActionButton from "../ui/SettingsActionButton.svelte";
  import SettingsStatusToggle from "../ui/SettingsStatusToggle.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  import PluginSource from "./PluginSource.svelte";
  import PluginSetup from "./PluginSetup.svelte";
  const { mcp, draft, plugins, openPlugin } = useSettingsContext();
  let selectedPluginKey = $state<string | null>(null);
  const pluginServers = $derived(
    plugins.agentPlugins.flatMap((plugin) =>
      plugin.mcp_servers.map((server) => ({
        key: `plugin:${plugin.id}:${server.name}`,
        plugin,
        server,
      })),
    ),
  );
  const selectedPluginServer = $derived(
    pluginServers.find((entry) => entry.key === selectedPluginKey),
  );
  $effect(() => {
    if (plugins.agentPluginsLoading) return;
    if (selectedPluginKey && !selectedPluginServer) selectedPluginKey = null;
    if (!selectedPluginKey && !mcp.userMcpServers.length && pluginServers.length)
      selectedPluginKey = pluginServers[0].key;
  });
</script>

<Tabs.Content value="extensions" class="settings-tab-panel">
  <div class="settings-list-col">
    <ScrollArea height="100%" class="provider-list-scroll" scrollHideDelay={350}>
      <div class="provider-list">
        {#if mcp.userMcpServers.length === 0 && pluginServers.length === 0 && !plugins.agentPluginsLoading}
          <div class="provider-list-empty">{$t("noMcpServers")}</div>
        {:else}
          {#each mcp.userMcpServers as server (server.id)}
            <ContextMenu.Root>
              <ContextMenu.Trigger>
                <button
                  class="provider-item {!selectedPluginKey && mcp.selectedMcpId === server.id
                    ? 'active'
                    : ''}"
                  onclick={() => {
                    selectedPluginKey = null;
                    mcp.selectedMcpId = server.id;
                  }}
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
                    onclick={() => mcp.removeMcpServer(server.id)}
                  >
                    {$t("deleteNode")}
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          {/each}
        {/if}
        {#if plugins.agentPluginsLoading}
          <div class="integration-list-skeleton" aria-busy="true" aria-label={$t("pluginLoading")}>
            <span></span><span></span>
          </div>
        {/if}
        {#each pluginServers as entry (entry.key)}
          <button
            class="provider-item"
            class:active={selectedPluginKey === entry.key}
            data-plugin-mcp={entry.key}
            onclick={() => (selectedPluginKey = entry.key)}
          >
            <div class="provider-item-icon mcp-icon">M</div>
            <div class="provider-item-info">
              <span class="provider-item-name">{entry.server.name}</span>
              <span class="provider-item-url"
                >{$t("integrationSource")}: {pluginText(
                  entry.plugin.i18n,
                  $locale,
                  "display_name",
                  entry.plugin.name,
                )}</span
              >
            </div>
            <span
              class:provider-enabled-dot={plugins.agentPluginEnabled(entry.plugin.id)}
              class:provider-disabled-dot={!plugins.agentPluginEnabled(entry.plugin.id)}
            ></span>
          </button>
        {/each}
        {#if plugins.agentPluginStatus}<p class="provider-status error" role="status">
            {plugins.agentPluginStatus}
          </p>{/if}
      </div>
    </ScrollArea>
    <div class="list-footer">
      <SettingsActionButton
        label={$t("addMcpServer")}
        icon="add"
        fullWidth
        onclick={() => {
          selectedPluginKey = null;
          mcp.addMcpServer();
        }}
      />
    </div>
  </div>

  {#if selectedPluginServer}
    {@const entry = selectedPluginServer}
    <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
      <section class="detail-section" data-plugin-mcp-detail={entry.key}>
        <div class="detail-section-header">
          <h4 class="detail-section-title">{entry.server.name}</h4>
          <SettingsStatusToggle
            checked={plugins.agentPluginEnabled(entry.plugin.id)}
            disabled={!!entry.plugin.error}
            onCheckedChange={(enabled) => plugins.setAgentPluginEnabled(entry.plugin.id, enabled)}
            ariaLabel={$t("pluginEnable")}
          />
        </div>
        <PluginSource plugin={entry.plugin} onOpen={openPlugin} />
        <p class="detail-hint">{entry.server.transport}</p>
        <p class="detail-hint">{$t("integrationPluginMcpHint")}</p>
        {#if entry.plugin.error}<p class="provider-status error" role="alert">
            {entry.plugin.error}
          </p>
        {:else}
          {#key entry.plugin.id}<PluginSetup
              plugin={entry.plugin}
              setup={plugins.setup}
              enabled={plugins.agentPluginEnabled(entry.plugin.id)}
            />{/key}
        {/if}
      </section>
    </ScrollArea>
  {:else if mcp.selectedMcpServer && mcp.selectedMcpIndex >= 0}
    {@const server = draft.draftConfig.mcp.servers[mcp.selectedMcpIndex]}
    {@const status = mcp.mcpTestStatus[server.id]}
    {@const discoveredTools = mcp.mcpDiscoveredTools[server.id] ?? []}
    {@const serverReady =
      server.transport === "http" ? server.url.trim().length > 0 : server.command.trim().length > 0}
    <div class="settings-detail-col">
      <div class="detail-top-bar">
        <span class="detail-service-name">{server.name || "Unnamed Server"}</span>
        <SettingsStatusToggle
          bind:checked={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].enabled}
          disabled={status?.tone === "testing"}
          onCheckedChange={(checked) => mcp.setMcpEnabled(server.id, checked)}
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
                bind:value={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].name}
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
              onclick={() => mcp.testMcpServer(server.id)}
              disabled={!serverReady || status?.tone === "testing"}
            />
            {#if server.transport === "http"}
              {#if mcp.mcpOAuthOffered(server.id)}
                <SettingsActionButton
                  label={$t("mcpAuthorize")}
                  icon="refresh"
                  onclick={() => mcp.authorizeMcpServer(server.id)}
                  disabled={!serverReady || status?.tone === "testing"}
                />
              {:else if mcp.mcpOAuthHint(server.id)}
                <p class="detail-hint mcp-oauth-hint">
                  {$t(mcp.mcpOAuthHint(server.id) ?? "mcpOAuthUnsupported")}
                </p>
              {/if}
            {/if}
          </div>
          <div class="detail-grid mcp-detail-grid">
            <div class="detail-label">
              <span class="label-text">{$t("mcpTransport")}</span>
              <Select
                bind:value={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].transport}
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
                  bind:value={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].url}
                  placeholder={$t("mcpServerUrlPlaceholder")}
                />
              </label>
              <label class="detail-label">
                <span class="label-text">{$t("mcpBearerToken")}</span>
                <input
                  type="password"
                  class="detail-input"
                  bind:value={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].bearer_token}
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
                    onclick={() => mcp.addHeader(mcp.selectedMcpIndex)}
                  />
                </div>
                {#each Object.entries(draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].headers) as [k] (k)}
                  <div class="env-row">
                    <input
                      class="detail-input env-key"
                      value={k}
                      placeholder={$t("mcpHeaderKeyPlaceholder")}
                      onchange={(e) =>
                        mcp.updateHeaderKey(
                          mcp.selectedMcpIndex,
                          k,
                          (e.target as HTMLInputElement).value,
                        )}
                    />
                    <input
                      class="detail-input env-val"
                      bind:value={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].headers[k]}
                      placeholder={$t("mcpHeaderValPlaceholder")}
                    />
                    <button
                      class="model-action-btn"
                      onclick={() => mcp.removeHeader(mcp.selectedMcpIndex, k)}>×</button
                    >
                  </div>
                {/each}
              </div>
            {:else}
              <label class="detail-label">
                <span class="label-text">{$t("mcpCommand")}</span>
                <input
                  class="detail-input"
                  bind:value={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].command}
                  placeholder={$t("mcpCommandPlaceholder")}
                />
              </label>
              <label class="detail-label">
                <span class="label-text">{$t("mcpArgs")}</span>
                <input
                  class="detail-input"
                  value={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].args.join(" ")}
                  placeholder={$t("mcpArgsPlaceholder")}
                  oninput={(e) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].args = v
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
                    onclick={() => mcp.addEnvVar(mcp.selectedMcpIndex)}
                  />
                </div>
                {#each Object.entries(draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].env) as [k] (k)}
                  <div class="env-row">
                    <input
                      class="detail-input env-key"
                      value={k}
                      placeholder={$t("mcpEnvKeyPlaceholder")}
                      onchange={(e) =>
                        mcp.updateEnvKey(
                          mcp.selectedMcpIndex,
                          k,
                          (e.target as HTMLInputElement).value,
                        )}
                    />
                    <input
                      class="detail-input env-val"
                      bind:value={draft.draftConfig.mcp.servers[mcp.selectedMcpIndex].env[k]}
                      placeholder={$t("mcpEnvValPlaceholder")}
                    />
                    <button
                      class="model-action-btn"
                      onclick={() => mcp.removeEnvVar(mcp.selectedMcpIndex, k)}>×</button
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
                    onCheckedChange={(checked) => mcp.setMcpToolEnabled(server.id, tool, checked)}
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
            onclick={() => mcp.removeMcpServer(server.id)}
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
