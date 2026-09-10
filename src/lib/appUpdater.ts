import { invoke } from "$lib/openagent/tauriClient";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { get, readonly, writable } from "svelte/store";
import { appUpdateReleaseUrl } from "$lib/appUpdateRelease";
import {
  formatComponentVersionTransitions,
  type ComponentVersionTransition,
} from "$lib/appUpdateVersions";
import { reportComponentUpdateEvent } from "$lib/frontendDiagnostics";
import { t, type TranslationKeys } from "$lib/i18n";
import {
  AppUpdateTimeoutError,
  RESOURCE_UPDATE_PREPARE_TIMEOUT_MS,
  withAppUpdateTimeout,
} from "$lib/appUpdateTimeout";
import { dismissToast, showToast, updateToast } from "$lib/toast";

export type AppUpdateState = "idle" | "checking" | "installing";

const mutableAppUpdateState = writable<AppUpdateState>("idle");
export const appUpdateState = readonly(mutableAppUpdateState);

function translate(key: TranslationKeys): string {
  return get(t)(key);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type PreparedFrontendResource = {
  version: string;
  current_version: string;
  update_available: boolean;
};

type PreparedRuntimeResource = {
  version: string;
  current_version: string | null;
  target: string;
  update_available: boolean;
};

type AvailableUpdates = {
  runtime: PreparedRuntimeResource | null;
  frontend: PreparedFrontendResource | null;
  shell: Update | null;
  shellDownload: Promise<void> | null;
};

type ComponentUpdateGate = {
  ready: boolean;
  active_count: number;
};

type DevComponentUpdateKind = "frontend" | "runtime";

function installTauriDevUpdateBarrier(): void {
  const hot = import.meta.hot;
  if (!import.meta.env.DEV || !hot || typeof window === "undefined" || !isTauri()) return;

  const pending = new Set<DevComponentUpdateKind>();
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let requesting = false;

  const requestReload = async () => {
    if (requesting || pending.size === 0) return;
    requesting = true;
    try {
      const gate = await invoke<ComponentUpdateGate>("begin_component_update");
      if (!gate.ready) {
        retryTimer = setTimeout(() => void requestReload(), 1000);
        return;
      }
      const kind = pending.has("runtime") ? "runtime" : "frontend";
      pending.clear();
      hot.send("openagent:component-update-ready", { kind });
    } catch {
      retryTimer = setTimeout(() => void requestReload(), 1000);
    } finally {
      requesting = false;
    }
  };

  const onPending = ({ kind }: { kind: DevComponentUpdateKind }) => {
    pending.add(kind);
    void requestReload();
  };

  void invoke("end_component_update").catch(() => {});
  hot.on("openagent:component-update-pending", onPending);
  hot.dispose(() => {
    hot.off("openagent:component-update-pending", onPending);
    if (retryTimer !== null) clearTimeout(retryTimer);
  });
}

installTauriDevUpdateBarrier();

async function checkForRuntimeResourceUpdate(): Promise<PreparedRuntimeResource | null> {
  if (import.meta.env.DEV) return null;
  const candidate = await withAppUpdateTimeout(
    invoke<PreparedRuntimeResource>("prepare_runtime_resource"),
    RESOURCE_UPDATE_PREPARE_TIMEOUT_MS,
  );
  return candidate.update_available ? candidate : null;
}

async function checkForFrontendResourceUpdate(): Promise<PreparedFrontendResource | null> {
  if (import.meta.env.DEV) return null;
  const candidate = await withAppUpdateTimeout(
    invoke<PreparedFrontendResource>("prepare_frontend_resource"),
    RESOURCE_UPDATE_PREPARE_TIMEOUT_MS,
  );
  return candidate.update_available ? candidate : null;
}

async function downloadShellUpdate(shell: Update): Promise<void> {
  const versions = { currentVersion: shell.currentVersion, candidateVersion: shell.version };
  await reportComponentUpdateEvent("shell", "download_started", versions);
  try {
    await shell.download();
    await reportComponentUpdateEvent("shell", "download_finished", versions);
  } catch (error) {
    await reportComponentUpdateEvent("shell", "download_failed", versions, error);
    throw error;
  }
}

async function installShellUpdate(shell: Update): Promise<void> {
  const versions = { currentVersion: shell.currentVersion, candidateVersion: shell.version };
  await reportComponentUpdateEvent("shell", "install_started", versions);
  try {
    await shell.install();
    await reportComponentUpdateEvent("shell", "install_finished", versions);
  } catch (error) {
    await reportComponentUpdateEvent("shell", "install_failed", versions, error);
    throw error;
  }
}

async function installUpdates(updates: AvailableUpdates): Promise<void> {
  if (get(mutableAppUpdateState) !== "idle") return;
  mutableAppUpdateState.set("installing");

  let progressToastId: number | null = null;
  let componentUpdateStarted = false;
  let frontendActivationCommitted = false;

  try {
    progressToastId = showToast({
      title: translate("updateInProgress"),
      description: translate("updatePreparingComponents"),
      durationMs: 0,
    });

    if (updates.shellDownload) {
      try {
        await updates.shellDownload;
      } catch {
        // A background download may fail after the notification is shown; retry
        // it when the user explicitly starts the update.
        if (updates.shell) await downloadShellUpdate(updates.shell);
      }
    } else if (updates.shell) {
      await downloadShellUpdate(updates.shell);
    }
    const gate = await invoke<ComponentUpdateGate>("begin_component_update");
    if (!gate.ready) {
      showToast({
        title: translate("updateDeferred"),
        description: translate("updateDeferredActiveAgent"),
        durationMs: 5000,
      });
      return;
    }
    componentUpdateStarted = true;
    if (updates.runtime) {
      updateToast(progressToastId, {
        description: translate("runtimeUpdateInProgressDescription"),
      });
      await invoke("activate_runtime_resource", {
        version: updates.runtime.version,
        target: updates.runtime.target,
      });
    }
    if (updates.frontend) {
      updateToast(progressToastId, {
        description: translate("frontendUpdateInProgressDescription"),
      });
      await invoke<void>("activate_frontend_resource", { version: updates.frontend.version });
      frontendActivationCommitted = true;
    }
    if (updates.shell) {
      updateToast(progressToastId, { description: translate("updateInstalling") });
      await installShellUpdate(updates.shell);
    }

    // A replacement frontend owns the completion notice after its startup
    // hook confirms activation and releases the Runtime write barrier.
    if (!updates.frontend) {
      showToast({
        title: translate("updateInstalled"),
        description: updates.shell
          ? translate("updateRestarting")
          : translate("updateComponentsInstalled"),
        durationMs: updates.shell ? 3000 : 5000,
      });
    }
    if (updates.shell) {
      await reportComponentUpdateEvent("shell", "restart_requested", {
        currentVersion: updates.shell.currentVersion,
        candidateVersion: updates.shell.version,
      });
      await invoke("restart_app");
    }
  } catch (error) {
    showToast({
      title: translate("updateFailed"),
      description: describeError(error),
      variant: "error",
      durationMs: 8000,
    });
  } finally {
    if (componentUpdateStarted && !frontendActivationCommitted) {
      await invoke("end_component_update").catch((error) =>
        console.warn("[openagent] Failed to release component update barrier", error),
      );
    }
    if (progressToastId !== null) {
      dismissToast(progressToastId);
    }
    mutableAppUpdateState.set("idle");
  }
}

export async function checkForAppUpdate(notifyWhenUpToDate = false): Promise<void> {
  if (get(mutableAppUpdateState) !== "idle") return;
  mutableAppUpdateState.set("checking");

  try {
    let runtime: PreparedRuntimeResource | null = null;
    try {
      runtime = await checkForRuntimeResourceUpdate();
    } catch (error) {
      console.warn("[openagent] Runtime resource update check failed", error);
    }
    let frontend: PreparedFrontendResource | null = null;
    try {
      frontend = await checkForFrontendResourceUpdate();
    } catch (error) {
      console.warn("[openagent] Frontend resource update check failed", error);
    }
    await reportComponentUpdateEvent("shell", "check_started");
    let shell: Update | null;
    try {
      shell = await withAppUpdateTimeout(check());
      await reportComponentUpdateEvent(
        "shell",
        shell ? "check_available" : "check_current",
        shell ? { currentVersion: shell.currentVersion, candidateVersion: shell.version } : {},
      );
    } catch (error) {
      await reportComponentUpdateEvent("shell", "check_failed", {}, error);
      throw error;
    }
    if (!shell && !runtime && !frontend) {
      if (notifyWhenUpToDate) {
        showToast({
          title: translate("updateCurrent"),
          description: translate("updateCurrentDescription"),
          durationMs: 3000,
        });
      }
      return;
    }

    const shellDownload = shell ? downloadShellUpdate(shell) : null;
    if (shellDownload) void shellDownload.catch(() => {});
    const updates: AvailableUpdates = { runtime, frontend, shell, shellDownload };
    const releaseUrl = shell ? appUpdateReleaseUrl(shell.version) : undefined;
    const componentVersionCandidates: Array<ComponentVersionTransition | null> = [
      shell
        ? {
            label: translate("updateComponentShell"),
            currentVersion: shell.currentVersion,
            candidateVersion: shell.version,
          }
        : null,
      frontend
        ? {
            label: translate("updateComponentFrontend"),
            currentVersion: frontend.current_version,
            candidateVersion: frontend.version,
          }
        : null,
      runtime
        ? {
            label: translate("updateComponentRuntime"),
            currentVersion: runtime.current_version,
            candidateVersion: runtime.version,
          }
        : null,
    ];
    const componentVersions = componentVersionCandidates.filter(
      (value): value is ComponentVersionTransition => value !== null,
    );
    const components = formatComponentVersionTransitions(componentVersions);
    showToast({
      title: translate("updateAvailable"),
      description: `${translate("updateComponentsAvailable")}: ${components}`,
      durationMs: 0,
      link: releaseUrl
        ? {
            label: translate("updateChangelog"),
            href: releaseUrl,
            onClick: () => openExternalUrl(releaseUrl),
          }
        : undefined,
      action: {
        label: translate("updateAll"),
        onClick: () => installUpdates(updates),
      },
    });
  } catch (error) {
    console.warn("[openagent] Update check failed", error);
    if (notifyWhenUpToDate) {
      showToast({
        title: translate("updateCheckFailed"),
        description:
          error instanceof AppUpdateTimeoutError
            ? translate("updateCheckTimedOut")
            : describeError(error),
        variant: "error",
        durationMs: 8000,
      });
    }
  } finally {
    mutableAppUpdateState.set("idle");
  }
}
