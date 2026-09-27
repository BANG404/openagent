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
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? "Unknown error";
  } catch {
    return "Unknown error";
  }
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

type PreparedCuaDriverResource = {
  current_version: string | null;
  latest_version: string;
  target: string;
  update_available: boolean;
  release_url: string;
};

type AvailableUpdates = {
  cuaDriver: PreparedCuaDriverResource | null;
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

async function checkForCuaDriverUpdate(): Promise<PreparedCuaDriverResource | null> {
  if (import.meta.env.DEV) return null;
  const candidate = await withAppUpdateTimeout(
    invoke<PreparedCuaDriverResource>("prepare_cua_driver_resource"),
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

async function installUpdates(updates: AvailableUpdates): Promise<void> {
  // NOSONAR: update activation is a transactional state machine kept together for rollback safety.
  if (get(mutableAppUpdateState) !== "idle") return;
  mutableAppUpdateState.set("installing");

  let progressToastId: number | null = null;
  let componentUpdateStarted = false;
  let frontendActivationCommitted = false;
  let shellInstallPrepared = false;
  let cuaDriverActivated = false;

  try {
    progressToastId = showToast({
      title: translate("updateInProgress"),
      description: translate("updatePreparingComponents"),
      durationMs: 0,
    });

    if (updates.shellDownload !== null) {
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
    if (updates.cuaDriver) {
      updateToast(progressToastId, {
        description: translate("cuaDriverUpdateInProgressDescription"),
      });
      await invoke("activate_cua_driver_resource", {
        version: updates.cuaDriver.latest_version,
        target: updates.cuaDriver.target,
      });
      cuaDriverActivated = true;
    }
    if (updates.frontend) {
      updateToast(progressToastId, {
        description: translate("frontendUpdateInProgressDescription"),
      });
      // A shell install ends this process after the Runtime is stopped. Leave
      // the frontend selection pending for the replacement process instead of
      // navigating this WebView into a frontend that cannot bootstrap.
      await invoke<void>("activate_frontend_resource", {
        version: updates.frontend.version,
        navigate: !updates.shell,
      });
      frontendActivationCommitted = !updates.shell;
    }
    if (updates.shell) {
      const shell = updates.shell;
      const shellVersions = {
        currentVersion: shell.currentVersion,
        candidateVersion: shell.version,
      };
      updateToast(progressToastId, { description: translate("updateInstalling") });
      // The host stops the Runtime and hides every surface here, because the
      // installer ends this process from inside `install()`. An unready
      // Runtime defers the update before anything is torn down.
      const prepared = await invoke<boolean>("begin_shell_install");
      if (!prepared) {
        showToast({
          title: translate("updateDeferred"),
          description: translate("updateDeferredActiveAgent"),
          durationMs: 5000,
        });
        return;
      }
      shellInstallPrepared = true;
      await reportComponentUpdateEvent("shell", "install_started", shellVersions);
      // Preparation already stopped the Runtime, so this process is not
      // coming back: either the installer replaces it or the restart below
      // does. A replacement frontend owns the completion notice after its
      // startup hook confirms activation; otherwise this is the last thing
      // the user sees.
      await reportComponentUpdateEvent("shell", "restart_requested", shellVersions);
      if (!updates.frontend) {
        showToast({
          title: translate("updateInstalled"),
          description: translate("updateRestarting"),
          durationMs: 3000,
        });
      }
      try {
        // On Windows this does not return: the installer replaces the process.
        // Keep the Windows NSIS handoff explicit. The updater currently
        // defaults this to true, but omitting it makes a plugin/config default
        // change look like a successful install followed by a dead desktop.
        await shell.install({ restartAfterInstall: true });
        await reportComponentUpdateEvent("shell", "install_finished", shellVersions);
      } catch (error) {
        await reportComponentUpdateEvent("shell", "install_failed", shellVersions, error);
        throw error;
      }
      await invoke("restart_app");
      return;
    }

    // A replacement frontend owns the completion notice after its startup
    // hook confirms activation and releases the Runtime write barrier.
    if (updates.cuaDriver) {
      showToast({
        title: translate("updateInstalled"),
        description: translate("cuaDriverUpdateRestarting"),
        durationMs: 3000,
      });
      await invoke("restart_app");
      return;
    }
    showToast({
      title: translate("updateInstalled"),
      description: translate("updateComponentsInstalled"),
      durationMs: 5000,
    });
  } catch (error) {
    if (shellInstallPrepared) {
      // The Runtime is already stopped and the windows are hidden, so the
      // only way back to a usable desktop is the restart that was pending.
      // The failure itself is already recorded against the step that hit it.
      console.warn("[openagent] Shell install failed after preparation; restarting", error);
      await invoke("restart_app").catch((restartError) =>
        console.error("[openagent] Failed to restart after the shell install", restartError),
      );
      return;
    }
    if (cuaDriverActivated) {
      console.warn(
        "[openagent] Cua Driver activation completed before a later update failed; restarting",
        error,
      );
      await invoke("restart_app").catch((restartError) =>
        console.error("[openagent] Failed to restart after Cua Driver activation", restartError),
      );
      return;
    }
    showToast({
      title: translate("updateFailed"),
      description: describeError(error),
      variant: "error",
      durationMs: 8000,
    });
  } finally {
    if (componentUpdateStarted && !frontendActivationCommitted && !shellInstallPrepared) {
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
  // NOSONAR: update discovery coordinates independent component checks and one user-visible result.
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
    let cuaDriver: PreparedCuaDriverResource | null = null;
    try {
      cuaDriver = await checkForCuaDriverUpdate();
    } catch (error) {
      console.warn("[openagent] Cua Driver update check failed", error);
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
    if (!shell && !runtime && !frontend && !cuaDriver) {
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
    if (shellDownload !== null) void shellDownload.catch(() => {});
    const updates: AvailableUpdates = { cuaDriver, runtime, frontend, shell, shellDownload };
    const releaseUrl = shell ? appUpdateReleaseUrl(shell.version) : cuaDriver?.release_url;
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
      cuaDriver
        ? {
            label: translate("updateComponentCuaDriver"),
            currentVersion: cuaDriver.current_version,
            candidateVersion: cuaDriver.latest_version,
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
