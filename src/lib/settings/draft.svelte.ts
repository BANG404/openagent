import { rebaseDraftValue } from "./draftMerge";
import { onMount, tick, untrack } from "svelte";
import type { AppConfig } from "$lib/types";
import { normalizeConfigShape, type NormalizedAppConfig } from "$lib/config";
import { reportFrontendDiagnostic } from "$lib/frontendDiagnostics";
import { settingsConfigChanged } from "$lib/settingsConfig";
import { DEFAULT_APP_CONFIG } from "$lib/settingsDefaults";
import type { SettingsOptions } from "./types";

export function createSettingsDraft(
  options: Pick<SettingsOptions, "config" | "onSave"> & {
    onAccepted: () => void;
    onSaved: (saved: NormalizedAppConfig, base: AppConfig) => Promise<void>;
  },
) {
  const pendingMcpServerIds = $state(new Set<string>());

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveInitialized = false;
  let suppressNextAutoSave = false;
  let pendingSave: Promise<void> = Promise.resolve();

  let draftConfig = $state<NormalizedAppConfig>(
    normalizeConfigShape(untrack(() => options.config) ?? DEFAULT_APP_CONFIG),
  );

  let initializedFromConfig = $state(false);

  let acceptedConfigFingerprint = JSON.stringify(
    normalizeConfigShape(untrack(() => options.config) ?? DEFAULT_APP_CONFIG),
  );

  $effect(() => {
    if (!options.config) return;
    const incoming = normalizeConfigShape(options.config);
    const incomingFingerprint = JSON.stringify(incoming);
    if (!initializedFromConfig) {
      draftConfig = incoming;
      acceptedConfigFingerprint = incomingFingerprint;
      options.onAccepted();
      initializedFromConfig = true;
      return;
    }
    if (incomingFingerprint === acceptedConfigFingerprint) return;

    const draftFingerprint = JSON.stringify($state.snapshot(draftConfig));
    if (draftFingerprint === incomingFingerprint) {
      acceptedConfigFingerprint = incomingFingerprint;
      return;
    }
    // Preserve an unsaved local edit until the backend can merge it against
    // the exact base snapshot or report a conflict. Clean drafts hot-reload.
    if (draftFingerprint !== acceptedConfigFingerprint) return;

    suppressNextAutoSave = true;
    draftConfig = incoming;
    acceptedConfigFingerprint = incomingFingerprint;
    options.onAccepted();
  });

  function snapshotDraftConfig() {
    const snapshot = $state.snapshot(draftConfig) as AppConfig;
    const fallbackId = snapshot.providers[0]?.id ?? "";
    if (!snapshot.defaults.chat_model.provider_id)
      snapshot.defaults.chat_model.provider_id = fallbackId;
    if (!snapshot.defaults.flash_model.provider_id)
      snapshot.defaults.flash_model.provider_id = fallbackId;
    return snapshot;
  }

  function saveDraftConfig() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (!initializedFromConfig) return Promise.resolve();
    const snapshot = snapshotDraftConfig();
    const incompletePendingMcp = snapshot.mcp.servers.some((server) => {
      if (!pendingMcpServerIds.has(server.id)) return false;
      return server.transport === "http" ? !server.url.trim() : !server.command.trim();
    });
    if (incompletePendingMcp) return Promise.resolve();
    if (!settingsConfigChanged(snapshot, acceptedConfigFingerprint)) return Promise.resolve();
    const baseConfig = JSON.parse(acceptedConfigFingerprint) as AppConfig;
    pendingSave = pendingSave
      .catch(() => {})
      .then(async () => {
        try {
          const saved = normalizeConfigShape(await options.onSave(snapshot, baseConfig));
          const edited = snapshotDraftConfig();
          const rebased = normalizeConfigShape(
            rebaseDraftValue(snapshot, saved, edited) as AppConfig,
          );
          suppressNextAutoSave = true;
          draftConfig = rebased;
          acceptedConfigFingerprint = JSON.stringify(saved);
          for (const server of edited.mcp.servers) pendingMcpServerIds.delete(server.id);
          options.onAccepted();
          await options.onSaved(saved, baseConfig);
        } catch (error) {
          reportFrontendDiagnostic("settings_save_failed", "SettingsView", error);
          await tick();
          if (options.config) {
            const latest = normalizeConfigShape(options.config);
            suppressNextAutoSave = true;
            draftConfig = latest;
            acceptedConfigFingerprint = JSON.stringify(latest);
            for (const id of pendingMcpServerIds) {
              if (!latest.mcp.servers.some((server) => server.id === id)) {
                pendingMcpServerIds.delete(id);
              }
            }
            options.onAccepted();
          }
          throw error;
        }
      });
    return pendingSave;
  }

  $effect(() => {
    JSON.stringify(draftConfig);
    if (suppressNextAutoSave) {
      suppressNextAutoSave = false;
      return;
    }
    if (!autoSaveInitialized) {
      autoSaveInitialized = true;
      return;
    }
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveDraftConfig().catch(console.error), 600);
  });
  onMount(() => () => {
    saveDraftConfig().catch(console.error);
  });

  return {
    get acceptedConfigFingerprint() {
      return acceptedConfigFingerprint;
    },
    get draftConfig() {
      return draftConfig;
    },
    get initializedFromConfig() {
      return initializedFromConfig;
    },
    get pendingMcpServerIds() {
      return pendingMcpServerIds;
    },
    saveDraftConfig,
  };
}
export type SettingsDraft = ReturnType<typeof createSettingsDraft>;
