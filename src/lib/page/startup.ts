import { tick } from "svelte";
import type { Component } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { desktopOpenAgent as openAgent, invoke } from "$lib/openagent/tauriClient";
import { installDownloadHook } from "$lib/downloadHook";
import { checkForAppUpdate } from "$lib/appUpdater";
import { reportFrontendDiagnostic } from "$lib/frontendDiagnostics";
import { initializeQuickChatShortcut } from "$lib/quickChatWindow";
import { loadMermaid } from "$lib/streamdown/mermaidRenderer";
import type { AppConfig, StartupBootstrap } from "$lib/types";
import type { CachedRestoreSurface } from "$lib/startupRestoreCache";
import type { SettingsNav, SettingsWindowKind } from "$lib/settingsWindows";

// Lazy views have different render-site contracts, checked by their consumers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyViewComponent = Component<any>;

interface StartupOptions {
  readonly isDevInspectorWindow: boolean;
  readonly standaloneDevPreview: string | null;
  readonly isSettingsWindow: boolean;
  readonly isRoleEditorWindow: boolean;
  readonly isQuickChatSurface: boolean;
  readonly isOnboardingSurface: boolean;
  readonly tauriAvailable: boolean;
  readonly isChannelsSettingsPreview: boolean;
  readonly isAgentsSettingsPreview: boolean;
  readonly isMcpSettingsPreview: boolean;
  readonly config: AppConfig | null;
  readonly launchContext: {
    workspace: string | null;
    conversation_id: string | null;
    message_id: string | null;
    new_conversation: boolean;
  } | null;
  readonly settingsPreviewSection: SettingsNav | null;
  isDarkTheme: boolean;
  initialLoading: boolean;
  SettingsView: LazyViewComponent | null;
  settingsSurface: { kind: SettingsWindowKind; section: SettingsNav; everySection: boolean } | null;
  restoringSurface: CachedRestoreSurface;
  activeConvId: string | null;
  loadSettings: () => Promise<void>;
  loadWorkspace: () => Promise<void>;
  applyStartupBootstrap: (bootstrap: StartupBootstrap) => Promise<void>;
  restoreStartupFallback: () => Promise<void>;
  setupGlobalEventListeners: () => Promise<void>;
  revealMemorySource: (convId: string, messageId: string) => Promise<void>;
  refreshAgentCommands: () => Promise<void>;
  pollMemoryStatus: () => void;
}

// A component update installs the frontend bundle under the running shell, so
// the first startup snapshot can lose that race with the swap. Retry it once
// before degrading: a shell that never subscribes to Runtime events shows no
// running Turn, and only an application restart used to heal it.
const STARTUP_SNAPSHOT_RETRY_DELAY_MS = 400;
const delay = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

/** Restores durable state, installs event delivery once, and reveals the startup surface. */
export function createPageStartup(options: StartupOptions) {
  async function start() {
    if (options.isDevInspectorWindow || options.standaloneDevPreview) return;
    if (options.isSettingsWindow || options.isRoleEditorWindow) return;
    if (options.isQuickChatSurface) {
      return;
    }
    if (options.isOnboardingSurface) {
      try {
        await options.loadSettings();
        await options.loadWorkspace();
      } catch (error) {
        console.error("Failed to load onboarding:", error);
      } finally {
        options.initialLoading = false;
      }
      return;
    }
    const mountedAt = performance.now();
    let bootstrapReadyAt = mountedAt;
    let startupApplied = false;
    let requiresOnboarding = false;
    let eventDeliveryInstalled = false;

    // Warm the large Mermaid dynamic module before revealing the main window.
    // Otherwise the first render_mermaid call can spend the Runtime's entire
    // 20-second response deadline compiling/loading the renderer.
    const mermaidPreload = loadMermaid().catch((error) => {
      console.warn("Failed to preload Mermaid renderer; it will retry on demand", error);
    });

    // Live Runtime events are a lossy projection. Restore the complete durable
    // snapshot before subscribing so startup and resync never reconstruct state
    // from partial event delivery. Registration stays single-attempt because
    // running it again would duplicate every Tauri listener, so a failure is
    // reported through the host diagnostics instead of leaving a shell that
    // shows no running Turn silent about why.
    const installRuntimeEventDelivery = async () => {
      if (!options.tauriAvailable || eventDeliveryInstalled) return;
      eventDeliveryInstalled = true;
      try {
        await options.setupGlobalEventListeners();
      } catch (error) {
        console.error("Failed to subscribe to Runtime events:", error);
        reportFrontendDiagnostic("startup_event_delivery_failed", "page-shell", error);
      }
    };

    const applyStartupSnapshot = async () => {
      const bootstrap = await openAgent.getStartupBootstrap<StartupBootstrap>();
      bootstrapReadyAt = performance.now();
      await options.applyStartupBootstrap(bootstrap);
      await installRuntimeEventDelivery();
      startupApplied = true;
      installDownloadHook();
      if (options.launchContext?.conversation_id) {
        await options.revealMemorySource(
          options.launchContext.conversation_id,
          options.launchContext.message_id ?? "",
        );
      }
    };

    try {
      // Seed isDarkTheme before settings load so shikiTheme is correct from first render
      options.isDarkTheme = window.matchMedia("(prefers-color-scheme: dark)").matches;
      await mermaidPreload;

      if (options.tauriAvailable) {
        await applyStartupSnapshot();
      } else {
        await options.loadSettings();
        await options.loadWorkspace();
        if (options.settingsPreviewSection) {
          options.SettingsView = (await import("$lib/components/SettingsView.svelte")).default;
          options.settingsSurface = {
            kind: options.settingsPreviewSection === "agents" ? "agent" : "integrations",
            section: options.settingsPreviewSection,
            everySection: true,
          };
        }
        options.restoringSurface = "new-conversation";
        options.activeConvId = null;
      }
    } catch (error) {
      console.error("Failed to apply startup bootstrap:", error);
      reportFrontendDiagnostic("startup_bootstrap_failed", "page-shell", error);
      if (options.tauriAvailable) {
        try {
          await delay(STARTUP_SNAPSHOT_RETRY_DELAY_MS);
          await applyStartupSnapshot();
        } catch (retryError) {
          console.error("Failed to apply startup bootstrap after retry:", retryError);
          reportFrontendDiagnostic("startup_bootstrap_failed", "page-shell", retryError);
          // A failure here must not skip the subscription below, which is the
          // only live projection the degraded shell has left.
          await options.restoreStartupFallback().catch((restoreError) => {
            console.error("Failed to restore startup state:", restoreError);
            reportFrontendDiagnostic("startup_restore_failed", "page-shell", restoreError);
          });
        }
        // Runtime events are the transcript's only live projection of a Turn, so
        // a degraded startup still subscribes. The fallback restore above
        // re-reads durable state first, so this cannot resurrect a stale Turn.
        await installRuntimeEventDelivery();
      }
    } finally {
      let embeddingResourceReady = !options.tauriAvailable;
      let embeddingResourceStatusKnown = !options.tauriAvailable;
      const mainWindowWasVisible = options.tauriAvailable
        ? await getCurrentWindow()
            .isVisible()
            .catch(() => false)
        : false;
      if (options.tauriAvailable) {
        embeddingResourceReady = await openAgent
          .invokeProduct("get_embedding_resource_status", {})
          .then((resource) => {
            embeddingResourceStatusKnown = true;
            return resource.state === "ready";
          })
          .catch(() => false);
      }
      if (
        options.config &&
        !options.isChannelsSettingsPreview &&
        !options.isAgentsSettingsPreview &&
        !options.isMcpSettingsPreview
      ) {
        // A Runtime restart can briefly make the resource-status IPC unavailable
        // while Vite HMR remounts this shell. Treat that as unknown so a reload
        // of an already configured app cannot reveal the hidden onboarding
        // window; an explicit non-ready status still opens the repair flow.
        requiresOnboarding =
          !options.config.onboarding_completed ||
          (embeddingResourceStatusKnown && !embeddingResourceReady) ||
          (!embeddingResourceStatusKnown && !mainWindowWasVisible);
      }
      const uiReadyAt = performance.now();
      options.initialLoading = false;
      await tick();
      if (options.tauriAvailable) {
        if (requiresOnboarding) {
          await invoke("reveal_onboarding_window").catch(async () => {
            await getCurrentWindow()
              .show()
              .catch(() => {});
          });
        } else {
          await invoke("reveal_main_window").catch(async () => {
            await getCurrentWindow()
              .show()
              .catch(() => {});
          });
        }
        const revealedAt = performance.now();
        console.info("[startup] initial window revealed", {
          surface: requiresOnboarding ? "onboarding" : "main",
          bootstrapMs: Math.round(bootstrapReadyAt - mountedAt),
          applyAndListenersMs: Math.round(uiReadyAt - bootstrapReadyAt),
          revealMs: Math.round(revealedAt - uiReadyAt),
          mountedToVisibleMs: Math.round(revealedAt - mountedAt),
        });
      }
    }

    if (options.tauriAvailable) {
      void options.refreshAgentCommands();
      options.pollMemoryStatus();
      if (!options.launchContext?.workspace) {
        void initializeQuickChatShortcut(options.config?.quick_chat_shortcut).catch((error) => {
          console.warn("Failed to register quick chat shortcut", error);
        });
        if (!import.meta.env.DEV) void checkForAppUpdate();
      }
      if (!startupApplied && options.launchContext?.conversation_id) {
        void options.revealMemorySource(
          options.launchContext.conversation_id,
          options.launchContext.message_id ?? "",
        );
      }
    }
  }
  return { start };
}
