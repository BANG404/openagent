import { createSettingsDraft } from "./draft.svelte";
import { createGeneralSettings } from "./general.svelte";
import { createProviderSettings } from "./providers.svelte";
import { createMcpSettings } from "./mcp.svelte";
import { createMemorySettings } from "./memory.svelte";
import { createChannelSettings } from "./channels.svelte";
import { createPluginSettings } from "./plugins.svelte";
import type { SettingsOptions } from "./types";
import { CUA_DRIVER_ID } from "$lib/cuaDriver";
import { startCuaDriverDaemon } from "$lib/openagent/cuaDriverHost";
import { desktopOpenAgent } from "$lib/openagent/tauriClient";
import { tr } from "$lib/i18n";

export function createSettingsController(options: SettingsOptions) {
  const draft = createSettingsDraft({
    get config() {
      return options.config;
    },
    onSave: (...args) => options.onSave(...args),
    onAccepted() {
      providers.ensureSelectedProvider();
      mcp.ensureSelectedMcpServer();
    },
    async onSaved(saved, base) {
      if (
        JSON.stringify(saved.agent_plugins_enabled ?? {}) !==
        JSON.stringify(base.agent_plugins_enabled ?? {})
      )
        void plugins.refreshAgentPlugins();
      if (
        saved.agent_plugins_host_access?.[CUA_DRIVER_ID] &&
        saved.agent_plugins_enabled?.[CUA_DRIVER_ID] !== false &&
        (!base.agent_plugins_host_access?.[CUA_DRIVER_ID] ||
          base.agent_plugins_enabled?.[CUA_DRIVER_ID] === false)
      ) {
        try {
          if (await startCuaDriverDaemon())
            await desktopOpenAgent.invokeProduct("refresh_mcp_servers", {});
        } catch (error) {
          plugins.agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
        }
      }
    },
  });
  const providers = createProviderSettings(draft, options);
  const mcp = createMcpSettings(draft);
  const general = createGeneralSettings(draft, options);
  const memory = createMemorySettings(draft, options);
  const channels = createChannelSettings(draft, options);
  const plugins = createPluginSettings(draft, options);
  return { draft, providers, mcp, general, memory, channels, plugins, options };
}
export type SettingsController = ReturnType<typeof createSettingsController>;
