import { invoke } from "$lib/openagent/tauriClient";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { get, readonly, writable } from "svelte/store";
import { appUpdateReleaseUrl } from "$lib/appUpdateRelease";
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
  update_available: boolean;
};

type PreparedRuntimeResource = {
  version: string;
  target: string;
  update_available: boolean;
};

type AvailableUpdates = {
  runtime: PreparedRuntimeResource | null;
  frontend: PreparedFrontendResource | null;
  shell: Update | null;
  shellDownload: Promise<void> | null;
};

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

async function installUpdates(updates: AvailableUpdates): Promise<void> {
  if (get(mutableAppUpdateState) !== "idle") return;
  mutableAppUpdateState.set("installing");

  let progressToastId: number | null = null;

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
        if (updates.shell) await updates.shell.download();
      }
    } else if (updates.shell) {
      await updates.shell.download();
    }
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
    }
    if (updates.shell) {
      updateToast(progressToastId, { description: translate("updateInstalling") });
      await updates.shell.install();
    }

    showToast({
      title: translate("updateInstalled"),
      description: updates.shell
        ? translate("updateRestarting")
        : translate("updateComponentsInstalled"),
      durationMs: updates.shell ? 3000 : 5000,
    });
    if (updates.shell) await invoke("restart_app");
  } catch (error) {
    showToast({
      title: translate("updateFailed"),
      description: describeError(error),
      variant: "error",
      durationMs: 8000,
    });
  } finally {
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
    const shell = await withAppUpdateTimeout(check());
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

    const shellDownload = shell ? shell.download() : null;
    if (shellDownload) void shellDownload.catch(() => {});
    const updates: AvailableUpdates = { runtime, frontend, shell, shellDownload };
    const releaseUrl = shell ? appUpdateReleaseUrl(shell.version) : undefined;
    const components = [
      shell ? translate("updateComponentShell") : null,
      frontend ? translate("updateComponentFrontend") : null,
      runtime ? translate("updateComponentRuntime") : null,
    ]
      .filter(Boolean)
      .join(", ");
    showToast({
      title: `${translate("updateAvailable")} ${shell?.version ?? frontend?.version ?? runtime?.version}`,
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
