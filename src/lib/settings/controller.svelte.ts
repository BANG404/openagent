import { createSettingsDraft } from "./draft.svelte";
import { createGeneralSettings } from "./general.svelte";
import { createProviderSettings } from "./providers.svelte";
import { createMcpSettings } from "./mcp.svelte";
import { createMemorySettings } from "./memory.svelte";
import { createChannelSettings } from "./channels.svelte";
import { createPluginSettings } from "./plugins.svelte";
import type { SettingsOptions } from "./types";
import { createIntegrationSettings } from "./integrations.svelte";

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
    },
  });
  const providers = createProviderSettings(draft, options);
  const mcp = createMcpSettings(draft);
  const general = createGeneralSettings(draft, options);
  const memory = createMemorySettings(draft, options);
  const channels = createChannelSettings(draft, options);
  const plugins = createPluginSettings(draft, options);
  const integrations = createIntegrationSettings(options);
  function openPlugin(id: string) {
    plugins.pluginManagementView = "installed";
    plugins.expandedPluginIds = [`plugin-${id}`];
    general.selectedSettingsSection = "plugins";
  }
  return {
    draft,
    providers,
    mcp,
    general,
    memory,
    channels,
    plugins,
    integrations,
    openPlugin,
    options,
  };
}
export type SettingsController = ReturnType<typeof createSettingsController>;
