import { desktopOpenAgent, emit, listen } from "$lib/openagent/tauriClient";
import { isTauri } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { onMount } from "svelte";
import { fromStore } from "svelte/store";
import type {
  AgentPluginSummary,
  AgentPluginInstallProgress,
  AgentPluginMarketplaceSummary,
  AgentPluginSidebarViewSummary,
  AgentPluginUpdateReport,
  AgentPluginUpdateSummary,
  AppConfig,
} from "$lib/types";
import { desktopPluginInstallQueue, type PluginInstallTask } from "$lib/agentPluginInstallQueue";
import { desktopPluginHostAccessQueue, pluginRequestsHostAccess } from "$lib/agentPluginHostAccess";
import { type NormalizedMcpServerConfig } from "$lib/config";
import {
  CUA_DRIVER_COMMAND,
  CUA_DRIVER_ID,
  createCuaDriverServer,
  cuaDriverMcpArgs,
  isCuaDriverServerCurrent,
} from "$lib/cuaDriver";
import { cuaDriverEndpoint, startCuaDriverDaemon } from "$lib/openagent/cuaDriverHost";
import { tr, locale, type TranslationKeys } from "$lib/i18n";
import {
  agentPluginUpdateErrorKey,
  classifyAgentPluginUpdateCheck,
  coalesceAgentPluginUpdateCheck,
  type AgentPluginUpdateCheckOutcome,
  type AgentPluginUpdateFailure,
} from "$lib/agentPluginUpdateCheck";
import {
  BUNDLED_OFFICIAL_PLUGIN_REGISTRY,
  projectOfficialPluginCatalog,
  type OfficialPluginCatalogFilter,
  type OfficialPluginCatalogItem,
  type OfficialPluginRegistryEntry,
} from "$lib/officialPluginRegistry";
import { pluginSidebarLifecycle, type PluginSidebarLifecycle } from "$lib/pluginSidebar";
import type { SettingsOptions } from "./types";
import type { SettingsDraft } from "./draft.svelte";

export function createPluginSettings(
  draft: SettingsDraft,
  options: Pick<SettingsOptions, "pluginSidebarContext" | "visibleSections">,
) {
  const language = fromStore(locale);
  let agentPlugins = $state<AgentPluginSummary[]>([]);
  let agentPluginMarketplaces = $state<AgentPluginMarketplaceSummary[]>([]);
  let agentPluginUpdates = $state<AgentPluginUpdateSummary[]>([]);
  let agentPluginUpdatesLoading = $state(false);
  let agentPluginUpdating = $state<string | null>(null);
  let agentPluginRemoveId = $state<string | null>(null);
  let agentPluginRemoving = $state(false);
  let agentPluginsLoading = $state(false);
  let agentPluginStatus = $state("");
  let agentPluginUpdateCheckStatus = $state<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  let officialPluginQuery = $state("");
  let officialPluginFilter = $state<OfficialPluginCatalogFilter>("all");
  let pluginManagementView = $state<"marketplace" | "installed">("marketplace");
  const pluginInstallQueue = desktopPluginInstallQueue;
  let agentPluginInstallTasks = $state<PluginInstallTask[]>(pluginInstallQueue.snapshot());
  const pluginHostAccessQueue = desktopPluginHostAccessQueue;
  let agentPluginHostAccessRequests = $state<AgentPluginSummary[]>(
    pluginHostAccessQueue.snapshot(),
  );
  let agentPluginHostAccessBusy = $state(false);
  let agentPluginHostAccessError = $state("");
  const agentPluginHostAccessRequest = $derived(agentPluginHostAccessRequests[0] ?? null);
  let agentPluginRefreshSequence = 0;
  const pluginInstallStageKeys: Record<AgentPluginInstallProgress["stage"], TranslationKeys> = {
    preparing: "pluginInstallPreparing",
    downloading: "pluginInstallDownloading",
    validating: "pluginInstallValidating",
    installing: "pluginInstallCopying",
    connecting: "pluginInstallConnecting",
    complete: "pluginInstalled",
  };
  function agentPluginInstallMessage(task: PluginInstallTask): string {
    if (task.status === "error") return `${tr("pluginOperationFailed")}: ${task.error}`;
    if (agentPluginHostAccessRequests.some((plugin) => plugin.id === task.progress.plugin_id))
      return tr("pluginInstallAwaitingHostAccess");
    if (task.hostAccessRequired && !agentPluginHostAccess(task.progress.plugin_id)) {
      return tr("pluginInstalledHostAccessRequired").replace("{name}", task.label);
    }
    if (task.status === "success") return tr("pluginInstallSuccess").replace("{name}", task.label);
    return tr(pluginInstallStageKeys[task.progress.stage]);
  }
  const officialPluginCards = $derived.by<OfficialPluginCatalogItem[]>(() =>
    projectOfficialPluginCatalog(BUNDLED_OFFICIAL_PLUGIN_REGISTRY, {
      locale: language.current,
      installedI18n: new Map(agentPlugins.map((plugin) => [plugin.id, plugin.i18n])),
      installed: new Map(agentPlugins.map((plugin) => [plugin.id, plugin.version])),
      updates: new Set(
        agentPluginUpdates.filter((update) => update.update_available).map((update) => update.id),
      ),
      query: officialPluginQuery,
      filter: officialPluginFilter,
    }),
  );

  let cuaDefaultApplied = $state(false);

  function findCuaDriverServer(): NormalizedMcpServerConfig | undefined {
    return draft.draftConfig.mcp.servers.find((server) => server.id === CUA_DRIVER_ID);
  }

  function setCuaDriverEnabled(enabled: boolean) {
    draft.draftConfig.agent_plugins_enabled = {
      ...(draft.draftConfig.agent_plugins_enabled ?? {}),
      [CUA_DRIVER_ID]: enabled,
    };
    const existing = findCuaDriverServer();
    if (existing) {
      existing.enabled = enabled;
      return;
    }
    const created = createCuaDriverServer(cuaDriverEndpoint());
    created.enabled = enabled;
    draft.draftConfig.mcp.servers = [created, ...draft.draftConfig.mcp.servers];
  }

  function agentPluginEnabled(pluginId: string): boolean {
    return draft.draftConfig.agent_plugins_enabled?.[pluginId] ?? true;
  }

  function setAgentPluginEnabled(pluginId: string, enabled: boolean) {
    draft.draftConfig.agent_plugins_enabled = {
      ...(draft.draftConfig.agent_plugins_enabled ?? {}),
      [pluginId]: enabled,
    };
  }

  function agentPluginHostAccess(pluginId: string): boolean {
    return draft.draftConfig.agent_plugins_host_access?.[pluginId] ?? false;
  }

  function agentPluginMcpToolMode(pluginId: string): string {
    return draft.draftConfig.agent_plugins_mcp_tool_modes?.[pluginId] ?? "default";
  }

  function setAgentPluginMcpToolMode(pluginId: string, mode: string) {
    const modes = { ...(draft.draftConfig.agent_plugins_mcp_tool_modes ?? {}) };
    if (mode === "default") delete modes[pluginId];
    else if (mode === "direct" || mode === "relay") modes[pluginId] = mode;
    else return;
    draft.draftConfig.agent_plugins_mcp_tool_modes = modes;
  }

  function setAgentPluginHostAccess(pluginId: string, granted: boolean) {
    draft.draftConfig.agent_plugins_host_access = {
      ...(draft.draftConfig.agent_plugins_host_access ?? {}),
      [pluginId]: granted,
    };
  }

  function deferAgentPluginHostAccess() {
    const plugin = agentPluginHostAccessRequest;
    if (!plugin || agentPluginHostAccessBusy) return;
    agentPluginHostAccessError = "";
    pluginHostAccessQueue.answer(plugin.id, false);
  }

  async function grantAgentPluginHostAccess() {
    const plugin = agentPluginHostAccessRequest;
    if (!plugin || agentPluginHostAccessBusy) return;
    agentPluginHostAccessBusy = true;
    agentPluginHostAccessError = "";
    try {
      setAgentPluginHostAccess(plugin.id, true);
      // Persist through the ordinary Settings path before activation consumes
      // the grant. Answering a chat question never changes this configuration.
      await draft.saveDraftConfig();
      if (!JSON.parse(draft.acceptedConfigFingerprint).agent_plugins_host_access?.[plugin.id]) {
        throw new Error(tr("pluginHostAccessSaveFailed"));
      }
      pluginHostAccessQueue.answer(plugin.id, true);
    } catch (error) {
      agentPluginHostAccessError = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      agentPluginHostAccessBusy = false;
    }
  }

  /**
   * Resolves one declared sidebar view against the host context the main window
   * reported. The plugin manager shows the same lifecycle the right sidebar
   * applies, so an entry it disables is exactly a panel the sidebar hides.
   */
  function pluginSidebarLifecycleFor(
    plugin: AgentPluginSummary,
    view: AgentPluginSidebarViewSummary,
  ): PluginSidebarLifecycle {
    return pluginSidebarLifecycle(view, plugin, options.pluginSidebarContext);
  }

  const cuaDriver = $derived(findCuaDriverServer() ?? createCuaDriverServer(cuaDriverEndpoint()));

  $effect(() => {
    if (!draft.initializedFromConfig || cuaDefaultApplied) return;
    const endpoint = cuaDriverEndpoint();
    // The desktop host owns the reserved endpoint, so an unresolved endpoint
    // means this surface cannot build the fixed launch shape yet.
    if (!endpoint) return;
    cuaDefaultApplied = true;
    const existing = findCuaDriverServer();
    if (!existing) {
      draft.draftConfig.mcp.servers = [
        createCuaDriverServer(endpoint),
        ...draft.draftConfig.mcp.servers,
      ];
      queueMicrotask(() => draft.saveDraftConfig().catch(console.error));
      return;
    }
    if (isCuaDriverServerCurrent(existing, endpoint)) return;
    // Entries written by older OpenAgent builds carried a permission mode, a
    // user-selected socket, and manifest overrides. The launch topology is
    // fixed product policy now, so normalize the reserved entry before the
    // next settings save.
    existing.command = CUA_DRIVER_COMMAND;
    existing.args = cuaDriverMcpArgs(endpoint);
    existing.env = {};
    existing.plugin_owned = true;
    queueMicrotask(() => draft.saveDraftConfig().catch(console.error));
  });

  async function refreshAgentPlugins() {
    if (!isTauri()) {
      agentPlugins = [];
      agentPluginMarketplaces = [];
      return;
    }
    agentPluginsLoading = true;
    const sequence = ++agentPluginRefreshSequence;
    agentPluginStatus = "";
    // The installed set is about to change, so the last explicit check result is
    // no longer a statement about the plugins on screen.
    agentPluginUpdateCheckStatus = null;
    try {
      const [plugins, marketplaces] = await Promise.allSettled([
        desktopOpenAgent.listAgentPlugins(),
        desktopOpenAgent.listAgentPluginMarketplaces(),
      ]);
      if (sequence !== agentPluginRefreshSequence) return;
      if (plugins.status === "fulfilled") agentPlugins = plugins.value;
      if (marketplaces.status === "fulfilled") agentPluginMarketplaces = marketplaces.value;
      const failure = [plugins, marketplaces].find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(failure.reason)}`;
      }
      void checkAgentPluginUpdates();
    } catch (error: unknown) {
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      if (sequence === agentPluginRefreshSequence) agentPluginsLoading = false;
    }
  }

  /**
   * Re-read the installed plugins for an explicit user refresh and announce it,
   * so the right sidebar rebuilds each mounted panel's package identity instead
   * of keeping the document it read before the plugin directory changed.
   */
  async function reloadAgentPlugins(): Promise<void> {
    await refreshAgentPlugins();
    await emit("agent-plugins-changed").catch(() => {});
  }

  async function checkAgentPluginUpdates(): Promise<AgentPluginUpdateReport | null> {
    if (!isTauri()) return null;
    agentPluginUpdatesLoading = true;
    try {
      // Startup, this surface, and the plugin-change listener can all ask at
      // once, and the check spends a quota shared with every other client on
      // this machine's address, so they share one run.
      const report = await coalesceAgentPluginUpdateCheck(() =>
        desktopOpenAgent.checkAgentPluginUpdates(),
      );
      agentPluginUpdates = report.updates;
      return report;
    } catch (error: unknown) {
      console.warn("Failed to check Agent Plugin updates:", error);
      return null;
    } finally {
      agentPluginUpdatesLoading = false;
    }
  }

  /** When the GitHub quota is reported to reset, in the user's own locale. */
  function formatRateLimitReset(resetAt: number): string {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(resetAt * 1000));
  }

  /**
   * Name the plugins whose release metadata could not be read, with the reason
   * each one gave.
   *
   * A bare count leaves the user with nothing to act on: it cannot separate an
   * unpublished local package from a GitHub outage. The reason is stated from
   * the classified kind so it reads in the user's language, and the raw
   * diagnostic stays on the plugin's own row.
   */
  function describeUpdateFailures(failures: AgentPluginUpdateFailure[]): string {
    const entry = tr("pluginUpdateFailureEntry");
    return failures
      .map((failure) => {
        const key = agentPluginUpdateErrorKey(failure.kind);
        return entry
          .replace("{name}", failure.id)
          .replace("{reason}", key === null ? failure.message : tr(key));
      })
      .join(tr("pluginUpdateFailureSeparator"));
  }

  /**
   * Turn a classified outcome into the one line the plugin page shows.
   *
   * A machine condition names the condition and what would lift it. Counting
   * every failed plugin as a broken package is what made an exhausted shared
   * quota look like six damaged plugins.
   */
  function agentPluginUpdateCheckMessage(
    outcome: AgentPluginUpdateCheckOutcome,
    fromCache: boolean,
  ): { tone: "success" | "error"; message: string } {
    const message = (() => {
      switch (outcome.kind) {
        case "failed":
          return { tone: "error" as const, message: tr("pluginUpdateCheckFailed") };
        case "rate_limited":
          return {
            tone: "error" as const,
            message: [
              tr("pluginUpdateRateLimited").replace("{count}", String(outcome.count)),
              outcome.resetAt === null
                ? ""
                : tr("pluginUpdateRateLimitedUntil").replace(
                    "{time}",
                    formatRateLimitReset(outcome.resetAt),
                  ),
            ]
              .filter(Boolean)
              .join(" "),
          };
        case "network_failed":
          return { tone: "error" as const, message: tr("pluginUpdateNetworkFailed") };
        case "available":
          return {
            tone: "success" as const,
            message: [
              tr("pluginUpdateDescription").replace("{count}", String(outcome.count)),
              outcome.failures.length === 0
                ? ""
                : tr("pluginUpdateDescriptionPartial")
                    .replace("{count}", String(outcome.failures.length))
                    .replace("{plugins}", describeUpdateFailures(outcome.failures)),
            ]
              .filter(Boolean)
              .join(" "),
          };
        case "incomplete":
          return {
            tone: "error" as const,
            message: tr("pluginUpdateCheckPartialFailure")
              .replace("{count}", String(outcome.failures.length))
              .replace("{plugins}", describeUpdateFailures(outcome.failures)),
          };
        case "current":
          return { tone: "success" as const, message: tr("pluginUpdateUpToDate") };
      }
    })();
    if (!fromCache) return message;
    // The check answers from a local freshness window instead of asking GitHub
    // again, so say the result may predate the click.
    return { ...message, message: `${message.message} ${tr("pluginUpdateFromCache")}` };
  }

  /**
   * Re-read GitHub release metadata for an explicit user request and report the
   * outcome. The check that follows loading the plugin directory stays silent so
   * an automatic network failure cannot replace an operation status; this manual
   * entry point always states what the check found.
   */
  async function runAgentPluginUpdateCheck(): Promise<void> {
    if (!isTauri() || agentPluginUpdatesLoading) return;
    agentPluginStatus = "";
    agentPluginUpdateCheckStatus = null;
    const { outcome, fromCache } = classifyAgentPluginUpdateCheck(await checkAgentPluginUpdates());
    agentPluginUpdateCheckStatus = agentPluginUpdateCheckMessage(outcome, fromCache);
  }

  async function updateAgentPlugin(pluginId: string): Promise<void> {
    if (!isTauri() || agentPluginUpdating || pluginInstallQueue.isInstalling(pluginId)) return;
    agentPluginUpdating = pluginId;
    agentPluginStatus = "";
    try {
      await desktopOpenAgent.updateAgentPlugin(pluginId);
      await refreshAgentPlugins();
      await emit("agent-plugins-changed").catch(() => {});
      agentPluginStatus = tr("pluginUpdated");
    } catch (error: unknown) {
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      agentPluginUpdating = null;
    }
  }

  function requestUninstallAgentPlugin(pluginId: string): void {
    if (pluginInstallQueue.isInstalling(pluginId)) return;
    const plugin = agentPlugins.find((item) => item.id === pluginId);
    if (!plugin || plugin.builtin) return;
    agentPluginRemoveId = pluginId;
  }

  function cancelUninstallAgentPlugin(): void {
    if (agentPluginRemoving) return;
    agentPluginRemoveId = null;
  }

  async function confirmUninstallAgentPlugin(): Promise<void> {
    const pluginId = agentPluginRemoveId;
    if (!pluginId || agentPluginRemoving || !isTauri()) return;
    agentPluginRemoving = true;
    ++agentPluginRefreshSequence;
    agentPluginStatus = "";
    try {
      await desktopOpenAgent.uninstallAgentPlugin(pluginId);
      agentPluginRemoveId = null;
      agentPlugins = agentPlugins.filter((plugin) => plugin.id !== pluginId);
      agentPluginUpdates = agentPluginUpdates.filter((plugin) => plugin.id !== pluginId);
      agentPluginMarketplaces = agentPluginMarketplaces.map((marketplace) => ({
        ...marketplace,
        plugins: marketplace.plugins.map((plugin) =>
          plugin.name === pluginId ? { ...plugin, installed: false } : plugin,
        ),
      }));
      await refreshAgentPlugins();
      await emit("agent-plugins-changed").catch(() => {});
      agentPluginStatus = tr("pluginUninstalled");
    } catch (error: unknown) {
      await refreshAgentPlugins();
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      agentPluginRemoving = false;
    }
  }

  async function runPluginInstall(
    key: string,
    pluginId: string | null,
    label: string,
    install: () => Promise<AgentPluginSummary>,
  ): Promise<void> {
    await pluginInstallQueue.run({
      key,
      pluginId,
      label,
      subscribe: (receive) => desktopOpenAgent.onAgentPluginInstallProgress(receive),
      install,
      activate: async (installed, progress) => {
        ++agentPluginRefreshSequence;
        agentPlugins = [...agentPlugins.filter((plugin) => plugin.id !== installed.id), installed];
        progress({ plugin_id: installed.id, stage: "connecting" });
        try {
          // Read the saved configuration: installation may finish after this
          // Settings controller unmounts, or another surface may save a grant.
          const saved = (await desktopOpenAgent.invokeProduct("get_settings", {})) as AppConfig;
          let granted = saved.agent_plugins_host_access?.[installed.id] ?? false;
          if (pluginRequestsHostAccess(installed) && !granted) {
            granted = await pluginHostAccessQueue.request(installed);
            if (!granted) return "host-access-required";
          }
          if (installed.id === CUA_DRIVER_ID && granted) {
            await startCuaDriverDaemon();
            await desktopOpenAgent.invokeProduct("refresh_mcp_servers", {});
          }
        } finally {
          await refreshAgentPlugins();
          await emit("agent-plugins-changed").catch(() => {});
        }
      },
    });
  }

  async function installAgentPlugin() {
    if (!isTauri()) return;
    const selected = await openDialog({ multiple: true, directory: true });
    if (!selected) return;
    await Promise.all(
      (Array.isArray(selected) ? selected : [selected]).map((source) =>
        runPluginInstall(`local:${source}`, null, source.split(/[\\/]/).pop() ?? source, () =>
          desktopOpenAgent.installAgentPlugin(source),
        ),
      ),
    );
  }

  async function installMarketplaceAgentPlugin(marketplacePath: string, pluginName: string) {
    if (!isTauri() || agentPluginUpdating === pluginName || agentPluginRemoveId === pluginName)
      return;
    await runPluginInstall(pluginName, pluginName, pluginName, () =>
      desktopOpenAgent.installMarketplaceAgentPlugin(marketplacePath, pluginName),
    );
  }

  async function installOfficialAgentPlugin(plugin: OfficialPluginRegistryEntry): Promise<void> {
    if (!isTauri() || agentPluginUpdating === plugin.id || agentPluginRemoveId === plugin.id)
      return;
    await runPluginInstall(plugin.id, plugin.id, plugin.displayName, () =>
      desktopOpenAgent.installOfficialAgentPlugin(plugin.id, plugin.displayName, plugin.sourceUrl),
    );
  }
  onMount(() => {
    if (!isTauri()) return;
    if (options.visibleSections.has("plugins")) refreshAgentPlugins().catch(() => {});
    const unlistenInstalls = pluginInstallQueue.subscribe((tasks) => {
      agentPluginInstallTasks = tasks;
    });
    const unlistenAccess = pluginHostAccessQueue.subscribe((plugins) => {
      agentPluginHostAccessRequests = plugins;
    });
    const unlistenChanges = options.visibleSections.has("plugins")
      ? listen("agent-plugins-changed", () => {
          void refreshAgentPlugins();
        })
      : Promise.resolve(() => {});
    return () => {
      unlistenInstalls();
      unlistenAccess();
      void unlistenChanges.then((dispose) => dispose());
    };
  });

  return {
    get agentPluginRemoveId() {
      return agentPluginRemoveId;
    },
    get agentPlugins() {
      return agentPlugins;
    },
    get agentPluginMarketplaces() {
      return agentPluginMarketplaces;
    },
    get officialPluginCards() {
      return officialPluginCards;
    },
    get officialPluginQuery() {
      return officialPluginQuery;
    },
    set officialPluginQuery(value: string) {
      officialPluginQuery = value;
    },
    get officialPluginFilter() {
      return officialPluginFilter;
    },
    set officialPluginFilter(value: OfficialPluginCatalogFilter) {
      officialPluginFilter = value;
    },
    get pluginManagementView() {
      return pluginManagementView;
    },
    set pluginManagementView(value: "marketplace" | "installed") {
      pluginManagementView = value;
    },
    get agentPluginInstallTasks() {
      return agentPluginInstallTasks;
    },
    get agentPluginInstalling() {
      return (key: string) =>
        agentPluginInstallTasks.some((task) => task.key === key && task.status === "running");
    },
    agentPluginInstallMessage,
    get agentPluginsLoading() {
      return agentPluginsLoading;
    },
    agentPluginEnabled,
    setAgentPluginEnabled,
    agentPluginMcpToolMode,
    setAgentPluginMcpToolMode,
    get pluginRequestsHostAccess() {
      return pluginRequestsHostAccess;
    },
    agentPluginHostAccess,
    setAgentPluginHostAccess,
    get agentPluginHostAccessRequest() {
      return agentPluginHostAccessRequest;
    },
    get agentPluginHostAccessBusy() {
      return agentPluginHostAccessBusy;
    },
    get agentPluginHostAccessError() {
      return agentPluginHostAccessError;
    },
    deferAgentPluginHostAccess,
    grantAgentPluginHostAccess,
    get agentPluginUpdates() {
      return agentPluginUpdates;
    },
    get agentPluginUpdatesLoading() {
      return agentPluginUpdatesLoading;
    },
    get agentPluginUpdating() {
      return agentPluginUpdating;
    },
    get agentPluginRemoveDialogOpen() {
      return agentPluginRemoveId !== null;
    },
    get agentPluginRemoveName() {
      return (
        agentPlugins.find((plugin) => plugin.id === agentPluginRemoveId)?.name ??
        agentPluginRemoveId ??
        ""
      );
    },
    get agentPluginRemoving() {
      return agentPluginRemoving;
    },
    get agentPluginStatus() {
      return agentPluginStatus;
    },
    get agentPluginUpdateCheckStatus() {
      return agentPluginUpdateCheckStatus;
    },
    installAgentPlugin,
    installMarketplaceAgentPlugin,
    installOfficialAgentPlugin,
    updateAgentPlugin,
    requestUninstallAgentPlugin,
    cancelUninstallAgentPlugin,
    confirmUninstallAgentPlugin,
    refreshAgentPlugins,
    reloadAgentPlugins,
    runAgentPluginUpdateCheck,
    get cuaDriver() {
      return cuaDriver;
    },
    pluginSidebarLifecycleFor,
    setCuaDriverEnabled,
    set agentPluginStatus(value: string) {
      agentPluginStatus = value;
    },
  };
}
export type PluginSettings = ReturnType<typeof createPluginSettings>;
