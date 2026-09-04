<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import SettingsView from "$lib/components/SettingsView.svelte";
  import { applyDocumentTheme, createNativeThemeSynchronizer } from "$lib/appTheme";
  import { normalizeConfigShape } from "$lib/config";
  import { emit, invoke, listen } from "$lib/openagent/tauriClient";
  import {
    settingsWindowSection,
    settingsWindowSections,
    type SettingsNav,
    type SettingsWindowKind,
  } from "$lib/settingsWindows";
  import { setLocale, t, type Locale, type TranslationKeys } from "$lib/i18n";
  import type { AppConfig, WorkspaceContext } from "$lib/types";

  let {
    kind,
    initialSection,
  }: {
    kind: SettingsWindowKind;
    initialSection?: string | null;
  } = $props();

  let config = $state<AppConfig | null>(null);
  let workspacePath = $state("");
  let selectedSection = $state<SettingsNav>(
    untrack(() => settingsWindowSection(kind, initialSection)),
  );
  let loadError = $state("");
  const appWindow = getCurrentWindow();
  const windowTitleKeys: Record<SettingsWindowKind, TranslationKeys> = {
    models: "modelsWindowTitle",
    agent: "agentWindowTitle",
    integrations: "integrationsWindowTitle",
    memory: "memoryManagement",
    automation: "automationWindowTitle",
    about: "aboutWindowTitle",
  };
  const synchronizeNativeTheme = createNativeThemeSynchronizer({
    applyWebTheme: applyDocumentTheme,
    setNativeTheme: (theme) => appWindow.setTheme(theme),
    onResolvedTheme: () => {},
    afterNativeThemeChange: () => new Promise((resolve) => setTimeout(resolve, 0)),
    onError: (error) => console.warn("Failed to synchronize settings window theme:", error),
  });

  function applyConfig(next: AppConfig): AppConfig {
    const normalized = normalizeConfigShape(next);
    config = structuredClone(normalized);
    setLocale((normalized.language ?? "zh") as Locale);
    void synchronizeNativeTheme(normalized.theme ?? "system");
    void appWindow.setTitle($t(windowTitleKeys[kind]));
    return normalized;
  }

  async function loadSurface(): Promise<void> {
    const [loadedConfig, workspace] = await Promise.all([
      invoke<AppConfig>("get_settings"),
      invoke<WorkspaceContext>("get_workspace_context").catch(() => null),
    ]);
    applyConfig(loadedConfig);
    workspacePath = workspace?.path ?? "";
    loadError = "";
  }

  async function saveSettings(next: AppConfig, baseConfig?: AppConfig): Promise<AppConfig> {
    const snapshot = normalizeConfigShape(next);
    const saved = await invoke<AppConfig>("save_settings", {
      config: snapshot,
      baseConfig: normalizeConfigShape(baseConfig ?? config ?? snapshot),
    });
    const normalized = applyConfig(saved);
    await emit("settings-changed");
    return structuredClone(normalized);
  }

  async function openConversation(conversationId: string): Promise<void> {
    await emit("settings-open-conversation", { conversationId });
    await invoke("reveal_main_window");
  }

  onMount(() => {
    let disposed = false;
    let stopSettings: (() => void) | undefined;
    let stopSectionRequests: (() => void) | undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if ((config?.theme ?? "system") === "system") void synchronizeNativeTheme("system");
    };
    media.addEventListener("change", syncSystemTheme);

    void loadSurface().catch((error) => {
      if (!disposed) loadError = `${error}`;
    });
    void listen("settings-changed", () => {
      void loadSurface().catch((error) => {
        if (!disposed) loadError = `${error}`;
      });
    }).then((stop) => {
      if (disposed) stop();
      else stopSettings = stop;
    });
    void listen<string>("settings-section-requested", (event) => {
      selectedSection = settingsWindowSection(kind, event.payload);
    }).then((stop) => {
      if (disposed) stop();
      else stopSectionRequests = stop;
    });

    return () => {
      disposed = true;
      stopSettings?.();
      stopSectionRequests?.();
      media.removeEventListener("change", syncSystemTheme);
    };
  });
</script>

<main class="settings-window-stage">
  {#if config}
    <SettingsView
      {config}
      {workspacePath}
      initialNav={selectedSection}
      sections={settingsWindowSections[kind]}
      onSave={saveSettings}
      onOpenConversation={openConversation}
    />
  {:else}
    <div class="settings-window-loading">
      <LoadingSkeleton variant="new-conversation" label={$t("loadingContent")} />
      {#if loadError}<p role="alert">{loadError}</p>{/if}
    </div>
  {/if}
</main>

<style>
  .settings-window-stage {
    width: 100vw;
    height: 100vh;
    display: flex;
    overflow: hidden;
    background: color-mix(in srgb, var(--bg) 30%, transparent);
    color: var(--text);
  }

  .settings-window-loading {
    width: min(560px, calc(100% - 48px));
    margin: auto;
  }

  .settings-window-loading p {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
