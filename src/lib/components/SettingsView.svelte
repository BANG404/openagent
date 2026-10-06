<script lang="ts">
  import "./settings-view.css";
  import { Tabs } from "bits-ui";
  import type { AppConfig } from "$lib/types";
  import type { SettingsNav } from "$lib/settingsWindows";
  import type { PluginSidebarContext } from "$lib/pluginSidebar";
  import type { RightSidebarPanel } from "$lib/rightSidebar";
  import { createSettingsController } from "$lib/settings/controller.svelte";
  import { provideSettingsContext } from "$lib/settings/context";
  import SettingsGeneralTab from "./settings/SettingsGeneralTab.svelte";
  import SettingsPluginsTab from "./settings/SettingsPluginsTab.svelte";
  import SettingsExecutionTab from "./settings/SettingsExecutionTab.svelte";
  import SettingsChannelsTab from "./settings/SettingsChannelsTab.svelte";
  import SettingsMemoryTab from "./settings/SettingsMemoryTab.svelte";
  import SettingsProvidersTab from "./settings/SettingsProvidersTab.svelte";
  import SettingsDefaultsTab from "./settings/SettingsDefaultsTab.svelte";
  import SettingsAgentsTab from "./settings/SettingsAgentsTab.svelte";
  import SettingsExtensionsTab from "./settings/SettingsExtensionsTab.svelte";
  import SettingsAboutTab from "./settings/SettingsAboutTab.svelte";
  import SettingsDialogs from "./settings/SettingsDialogs.svelte";
  let {
    config,
    workspacePath,
    initialNav,
    sections,
    onSave,
    onOpenConversation,
    onThemePreview,
    onOpenPluginSidebarView,
    pluginSidebarContext = {
      hasWorkspace: workspacePath.trim().length > 0,
      hasConversation: false,
    },
  }: {
    config: AppConfig | null;
    workspacePath: string;
    initialNav?: SettingsNav;
    sections?: SettingsNav[];
    onSave: (config: AppConfig, baseConfig?: AppConfig) => Promise<AppConfig>;
    onOpenConversation: (conversationId: string) => Promise<void>;
    onThemePreview?: (theme: string) => void;
    /** Absent in the standalone settings window, which owns no right sidebar. */
    onOpenPluginSidebarView?: (panel: RightSidebarPanel) => void;
    pluginSidebarContext?: PluginSidebarContext;
  } = $props();

  const visibleSections = $derived(
    new Set<SettingsNav>(
      sections ?? [
        "general",
        "channels",
        "providers",
        "defaults",
        "execution",
        "agents",
        "memory",
        "extensions",
        "plugins",
        "about",
      ],
    ),
  );
  const view = createSettingsController({
    get config() {
      return config;
    },
    get workspacePath() {
      return workspacePath;
    },
    get initialNav() {
      return initialNav;
    },
    get sections() {
      return sections;
    },
    get onSave() {
      return onSave;
    },
    get onOpenConversation() {
      return onOpenConversation;
    },
    get onThemePreview() {
      return onThemePreview;
    },
    get onOpenPluginSidebarView() {
      return onOpenPluginSidebarView;
    },
    get pluginSidebarContext() {
      return pluginSidebarContext;
    },
    get visibleSections() {
      return visibleSections;
    },
  });
  provideSettingsContext(view);
</script>

<svelte:window onkeydown={view.general.handleQuickShortcutKeydown} />
<div
  class="application-settings-scope settings-panel"
  class:single-section={visibleSections.size === 1}
>
  <Tabs.Root
    bind:value={view.general.selectedSettingsSection}
    orientation="vertical"
    activationMode="manual"
    class="settings-body"
  >
    <SettingsGeneralTab />
    <SettingsPluginsTab />
    <SettingsExecutionTab />
    <SettingsChannelsTab />
    <SettingsMemoryTab />
    <SettingsProvidersTab />
    <SettingsDefaultsTab />
    <SettingsAgentsTab />
    <SettingsExtensionsTab />
    <SettingsAboutTab />
  </Tabs.Root>
</div>
<SettingsDialogs />
