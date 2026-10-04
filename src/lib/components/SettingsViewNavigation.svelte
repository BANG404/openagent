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
  import SettingsAboutTab from "./SettingsAboutTab.svelte";
  import type { SettingsNav } from "$lib/settingsWindows";
  import { approvalModeDescriptionKey, DEFAULT_APP_CONFIG } from "$lib/settingsDefaults";
  const view = getContext<Record<string, unknown>>("settings-view") as Record<string, any>;
</script>

<Tabs.List class="settings-nav-col">
  <div class="settings-nav-items">
    {#if view.visibleSections.has("general")}
      <Tabs.Trigger value="general" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="2.4" />
          <path
            d="M8 1.8v1.4M8 12.8v1.4M3.6 3.6l1 1M11.4 11.4l1 1M1.8 8h1.4M12.8 8h1.4M3.6 12.4l1-1M11.4 4.6l1-1"
          />
        </svg>
        {$t("general")}
      </Tabs.Trigger>
    {/if}
    {#if view.visibleSections.has("channels")}
      <Tabs.Trigger value="channels" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 4.2h10v7.6H3z" />
          <path d="m5.2 6.4 2.1 1.7a1.1 1.1 0 0 0 1.4 0l2.1-1.7" />
          <path d="M5 2.2v2M11 2.2v2M5 11.8v2M11 11.8v2" />
        </svg>
        {$t("channels")}
      </Tabs.Trigger>
    {/if}
    {#if view.visibleSections.has("providers")}
      <Tabs.Trigger value="providers" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="2.5" y="3" width="11" height="3.5" rx="1" />
          <rect x="2.5" y="9.5" width="11" height="3.5" rx="1" />
          <path d="M5 4.75h.01M5 11.25h.01M8 6.5v3" />
        </svg>
        {$t("providers")}
      </Tabs.Trigger>
    {/if}
    {#if view.visibleSections.has("defaults")}
      <Tabs.Trigger value="defaults" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M8 2.2l1.7 3.5 3.8.6-2.8 2.7.7 3.8L8 11l-3.4 1.8.7-3.8-2.8-2.7 3.8-.6L8 2.2z" />
        </svg>
        {$t("defaultModels")}
      </Tabs.Trigger>
    {/if}
    {#if view.visibleSections.has("execution")}
      <Tabs.Trigger value="execution" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M8 1.8 13 4.2v3.5c0 3.1-2 5.4-5 6.5-3-1.1-5-3.4-5-6.5V4.2L8 1.8Z" />
          <path d="m5.8 8 1.4 1.4 3-3" />
        </svg>
        {$t("executionAndPermissions")}
      </Tabs.Trigger>
    {/if}
    {#if view.visibleSections.has("agents")}
      <Tabs.Trigger value="agents" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4.2 4.2h7.6v5.2H8.7L6 12v-2.6H4.2z" />
          <path d="M6 6.2h4M6 8h2.6" />
        </svg>
        {$t("flashAgents")}
      </Tabs.Trigger>
    {/if}
    {#if view.visibleSections.has("memory")}
      <Tabs.Trigger value="memory" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <ellipse cx="8" cy="3.5" rx="5" ry="1.8" />
          <path d="M3 3.5v6.8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V3.5" />
          <path d="M3 7c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" />
        </svg>
        {$t("memoryManagement")}
      </Tabs.Trigger>
    {/if}
    {#if view.visibleSections.has("extensions")}
      <Tabs.Trigger value="extensions" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.8a3.5 3.5 0 0 1-7 0V5.5zM8 11.8v1.7" />
        </svg>
        {$t("extensions")}
      </Tabs.Trigger>
    {/if}
    {#if view.visibleSections.has("plugins")}
      <Tabs.Trigger value="plugins" class="settings-nav-item">
        <span class="nav-icon" aria-hidden="true">◈</span>
        {$t("plugins")}
      </Tabs.Trigger>
    {/if}
  </div>
  <div class="settings-nav-bottom">
    {#if view.visibleSections.has("about")}
      <Tabs.Trigger value="about" class="settings-nav-item">
        <svg
          class="nav-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 7.5v3.2M8 5.2h.01" />
        </svg>
        {$t("about")}
      </Tabs.Trigger>
    {/if}
  </div>
</Tabs.List>
