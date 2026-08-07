<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { isTauri } from "@tauri-apps/api/core";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { onMount } from "svelte";
  import type { AgentPluginSummary } from "$lib/types";
  import { t, tr } from "$lib/i18n";

  const routePreview =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("agent-plugins-settings-preview");
  const previewFixture: AgentPluginSummary[] = routePreview
    ? [
        {
          id: "developer-toolkit",
          name: "developer-toolkit",
          version: "1.2.0",
          description: "Portable development workflows and repository tools.",
          path: "C:/Users/demo/.openagent-dev/plugins/developer-toolkit",
          skills: [
            { name: "code-review", description: "Review code changes and risks." },
            { name: "release-notes", description: "Prepare concise release notes." },
          ],
          mcp_servers: [
            { name: "repository", transport: "stdio" },
            { name: "documentation", transport: "streamable-http" },
          ],
          warnings: ["Skipped MCP server 'legacy': legacy SSE transport is not supported"],
          error: null,
        },
      ]
    : [];
  let plugins = $state<AgentPluginSummary[]>(previewFixture);
  let loading = $state(!routePreview);
  let busy = $state<string | null>(null);
  let message = $state("");
  let messageTone = $state<"success" | "error">("success");

  onMount(() => {
    if (!routePreview) void loadPlugins();
  });

  async function loadPlugins() {
    if (!isTauri()) {
      loading = false;
      return;
    }
    loading = true;
    try {
      plugins = await invoke<AgentPluginSummary[]>("list_agent_plugins");
    } catch (error) {
      showMessage("error", `${tr("agentPluginsLoadFailed")}: ${String(error)}`);
    } finally {
      loading = false;
    }
  }

  function showMessage(tone: "success" | "error", value: string) {
    messageTone = tone;
    message = value;
  }

  async function installPlugin() {
    if (!isTauri() || busy) return;
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    busy = "install";
    message = "";
    try {
      const installed = await invoke<AgentPluginSummary>("install_agent_plugin", {
        sourcePath: selected,
      });
      await loadPlugins();
      showMessage("success", `${tr("agentPluginInstalled")}: ${installed.name}`);
    } catch (error) {
      showMessage("error", `${tr("agentPluginInstallFailed")}: ${String(error)}`);
    } finally {
      busy = null;
    }
  }

  async function uninstallPlugin(plugin: AgentPluginSummary) {
    if (!isTauri() || busy) return;
    if (!confirm(`${tr("agentPluginUninstallConfirm")}\n\n${plugin.name}`)) return;
    busy = plugin.id;
    message = "";
    try {
      await invoke("uninstall_agent_plugin", { id: plugin.id });
      await loadPlugins();
      showMessage("success", `${tr("agentPluginUninstalled")}: ${plugin.name}`);
    } catch (error) {
      showMessage("error", `${tr("agentPluginUninstallFailed")}: ${String(error)}`);
    } finally {
      busy = null;
    }
  }

  async function openPluginFolder(plugin: AgentPluginSummary) {
    if (!isTauri()) return;
    try {
      await invoke("open_path", { path: plugin.path });
    } catch (error) {
      showMessage("error", String(error));
    }
  }
</script>

<div class="plugins-settings" data-testid="agent-plugins-settings">
  <header class="plugins-heading">
    <div>
      <h3>{$t("agentPluginsTitle")}</h3>
      <p>{$t("agentPluginsDescription")}</p>
    </div>
    <button class="install-button" disabled={busy !== null} onclick={installPlugin}>
      {busy === "install" ? $t("agentPluginInstalling") : $t("agentPluginInstall")}
    </button>
  </header>

  <div class="compatibility-note">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M8 1.8 13.5 4.8v3.9c0 2.7-2.2 4.5-5.5 5.5-3.3-1-5.5-2.8-5.5-5.5V4.8L8 1.8Z" />
      <path d="m5.6 8 1.5 1.5 3.4-3.4" />
    </svg>
    <p>{$t("agentPluginsCompatibility")}</p>
  </div>

  {#if message}
    <div class="operation-message {messageTone}" role="status">{message}</div>
  {/if}

  {#if loading}
    <div class="plugin-skeleton" aria-label={$t("loadingContent")}>
      <span></span><span></span><span></span>
    </div>
  {:else if plugins.length === 0}
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">P</div>
      <h4>{$t("agentPluginsEmpty")}</h4>
      <p>{$t("agentPluginsEmptyHint")}</p>
    </div>
  {:else}
    <div class="plugin-list">
      {#each plugins as plugin (plugin.id)}
        <article class:error-card={plugin.error} class="plugin-card">
          <div class="plugin-card-heading">
            <div class="plugin-mark" aria-hidden="true">
              {plugin.name.slice(0, 1).toUpperCase()}
            </div>
            <div class="plugin-identity">
              <div class="plugin-name-line">
                <h4>{plugin.name}</h4>
                {#if plugin.version}<span class="version">v{plugin.version}</span>{/if}
                {#if plugin.error}<span class="invalid-badge">{$t("agentPluginInvalid")}</span>{/if}
              </div>
              {#if plugin.description}<p>{plugin.description}</p>{/if}
            </div>
            <div class="plugin-actions">
              <button class="quiet-button" onclick={() => openPluginFolder(plugin)}>
                {$t("agentPluginOpenFolder")}
              </button>
              <button
                class="remove-button"
                disabled={busy !== null}
                onclick={() => uninstallPlugin(plugin)}
              >
                {busy === plugin.id ? $t("agentPluginRemoving") : $t("agentPluginUninstall")}
              </button>
            </div>
          </div>

          {#if plugin.error}
            <p class="diagnostic error">{plugin.error}</p>
          {:else}
            <div class="component-summary">
              <div>
                <span class="component-count">{plugin.skills.length}</span>
                <span>{$t("agentPluginSkills")}</span>
              </div>
              <div>
                <span class="component-count">{plugin.mcp_servers.length}</span>
                <span>{$t("agentPluginMcpServers")}</span>
              </div>
            </div>
            {#if plugin.skills.length > 0 || plugin.mcp_servers.length > 0}
              <div class="component-tags">
                {#each plugin.skills as skill (skill.name)}
                  <span class="component-tag">Skill: {skill.name}</span>
                {/each}
                {#each plugin.mcp_servers as server (server.name)}
                  <span class="component-tag">MCP: {server.name} ({server.transport})</span>
                {/each}
              </div>
            {/if}
          {/if}

          {#if plugin.warnings.length > 0}
            <details class="warnings">
              <summary>{plugin.warnings.length} {$t("agentPluginDiagnostics")}</summary>
              <ul>
                {#each plugin.warnings as warning, index (`${index}:${warning}`)}<li>
                    {warning}
                  </li>{/each}
              </ul>
            </details>
          {/if}
        </article>
      {/each}
    </div>
  {/if}

  <p class="data-note">{$t("agentPluginDataPreserved")}</p>
</div>

<style>
  .plugins-settings {
    width: 100%;
    min-height: 100%;
    padding: 28px max(24px, calc((100% - 680px) / 2)) 40px;
    color: var(--text);
  }

  .plugins-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 18px;
  }

  h3,
  h4,
  p {
    margin: 0;
  }

  .plugins-heading h3 {
    font-size: 20px;
    line-height: 1.3;
  }

  .plugins-heading p,
  .plugin-identity p,
  .empty-state p,
  .data-note {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
  }

  button {
    font: inherit;
  }

  .install-button,
  .quiet-button,
  .remove-button {
    min-height: 32px;
    padding: 6px 12px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
  }

  .install-button {
    flex: none;
    background: var(--primary);
    color: white;
    font-weight: 600;
  }

  button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .compatibility-note {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 18px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--surface2);
    box-shadow: var(--control-shadow);
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .compatibility-note svg {
    flex: none;
    width: 17px;
    stroke-width: 1.4;
    color: var(--success, #2d8a55);
  }

  .operation-message {
    margin-bottom: 14px;
    padding: 9px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--success, #2d8a55) 10%, var(--surface2));
    color: var(--success, #2d8a55);
    font-size: 12px;
  }

  .operation-message.error,
  .diagnostic.error {
    background: color-mix(in srgb, var(--danger) 9%, var(--surface2));
    color: var(--danger);
  }

  .plugin-list {
    display: grid;
    gap: 12px;
  }

  .plugin-card,
  .empty-state,
  .plugin-skeleton {
    border-radius: 12px;
    background: var(--surface2);
    box-shadow: var(--control-shadow);
  }

  .plugin-card {
    padding: 16px;
  }

  .plugin-card.error-card {
    background: color-mix(in srgb, var(--danger) 5%, var(--surface2));
  }

  .plugin-card-heading {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .plugin-mark,
  .empty-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary) 12%, var(--control-surface));
    color: var(--primary);
    font-size: 14px;
    font-weight: 700;
  }

  .plugin-identity {
    min-width: 0;
    flex: 1;
  }

  .plugin-name-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
  }

  .plugin-name-line h4 {
    font-size: 14px;
  }

  .version,
  .invalid-badge,
  .component-tag {
    border-radius: 999px;
    padding: 2px 7px;
    background: var(--control-surface);
    color: var(--text-muted);
    font-size: 10px;
  }

  .invalid-badge {
    color: var(--danger);
  }

  .plugin-actions {
    display: flex;
    flex: none;
    gap: 6px;
  }

  .quiet-button,
  .remove-button {
    background: var(--control-surface);
    color: var(--text-muted);
    box-shadow: var(--control-shadow);
    font-size: 11px;
  }

  .quiet-button:hover {
    color: var(--text);
  }

  .remove-button {
    color: var(--danger);
  }

  .component-summary {
    display: flex;
    gap: 22px;
    margin: 14px 0 10px 48px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .component-summary > div {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .component-count {
    color: var(--text);
    font-size: 17px;
    font-weight: 600;
  }

  .component-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-left: 48px;
  }

  .diagnostic {
    margin: 14px 0 0 48px;
    padding: 9px 10px;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.45;
  }

  .warnings {
    margin: 12px 0 0 48px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .warnings summary {
    cursor: pointer;
  }

  .warnings ul {
    margin: 8px 0 0;
    padding-left: 18px;
    line-height: 1.55;
  }

  .empty-state {
    display: grid;
    justify-items: center;
    padding: 48px 24px;
    text-align: center;
  }

  .empty-state h4 {
    margin-top: 12px;
    font-size: 14px;
  }

  .plugin-skeleton {
    display: grid;
    gap: 10px;
    padding: 20px;
  }

  .plugin-skeleton span {
    height: 12px;
    border-radius: 6px;
    background: var(--control-surface);
    animation: pulse 1.2s ease-in-out infinite alternate;
  }

  .plugin-skeleton span:nth-child(2) {
    width: 72%;
  }

  .plugin-skeleton span:nth-child(3) {
    width: 48%;
  }

  .data-note {
    margin-top: 16px;
  }

  @keyframes pulse {
    to {
      opacity: 0.45;
    }
  }

  @media (max-width: 720px) {
    .plugins-heading,
    .plugin-card-heading {
      flex-wrap: wrap;
    }

    .plugin-actions {
      width: 100%;
      margin-left: 48px;
    }
  }
</style>
