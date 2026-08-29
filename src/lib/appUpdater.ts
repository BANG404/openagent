import { invoke } from "$lib/openagent/tauriClient";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { get, readonly, writable } from "svelte/store";
import { appUpdateReleaseUrl } from "$lib/appUpdateRelease";
import { t, type TranslationKeys } from "$lib/i18n";
import { AppUpdateTimeoutError, withAppUpdateTimeout } from "$lib/appUpdateTimeout";
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

async function checkForFrontendResourceUpdate(): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  const candidate = await withAppUpdateTimeout(
    invoke<PreparedFrontendResource>("prepare_frontend_resource"),
  );
  if (!candidate.update_available) return false;
  showToast({
    title: `${translate("frontendUpdateAvailable")} ${candidate.version}`,
    description: translate("frontendUpdateAvailableDescription"),
    durationMs: 0,
    action: {
      label: translate("updateAndReload"),
      onClick: async () =>
        invoke<void>("activate_frontend_resource", { version: candidate.version }).catch(
          (error) => {
            showToast({
              title: translate("updateFailed"),
              description: describeError(error),
              variant: "error",
              durationMs: 8000,
            });
          },
        ),
    },
  });
  return true;
}

function updateProgressMessage(
  event: DownloadEvent,
  downloadedBytes: number,
  totalBytes?: number,
): string {
  if (event.event === "Started") {
    return translate("updateDownloading");
  }
  if (event.event === "Finished") {
    return translate("updateInstalling");
  }
  if (totalBytes && totalBytes > 0) {
    const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
    return `${translate("updateDownloaded")} ${percent}%`;
  }
  return translate("updateDownloading");
}

async function installUpdate(update: Update): Promise<void> {
  if (get(mutableAppUpdateState) !== "idle") return;
  mutableAppUpdateState.set("installing");

  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  let progressToastId: number | null = null;
  let lastProgressBucket = -1;

  try {
    progressToastId = showToast({
      title: translate("updateInProgress"),
      description: translate("updateDownloading"),
      durationMs: 0,
    });

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        downloadedBytes = 0;
        totalBytes = event.data.contentLength;
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
      }

      const bucket = totalBytes ? Math.floor((downloadedBytes / totalBytes) * 10) : -1;
      if (event.event !== "Progress" || bucket > lastProgressBucket) {
        lastProgressBucket = bucket;
        if (progressToastId === null) return;
        updateToast(progressToastId, {
          title: translate("updateInProgress"),
          description: updateProgressMessage(event, downloadedBytes, totalBytes),
        });
      }
    });

    showToast({
      title: translate("updateInstalled"),
      description: translate("updateRestarting"),
      durationMs: 3000,
    });
    await invoke("restart_app");
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
    let frontendUpdateAvailable = false;
    try {
      frontendUpdateAvailable = await checkForFrontendResourceUpdate();
    } catch (error) {
      console.warn("[openagent] Frontend resource update check failed", error);
    }
    const update = await withAppUpdateTimeout(check());
    if (!update) {
      if (notifyWhenUpToDate && !frontendUpdateAvailable) {
        showToast({
          title: translate("updateCurrent"),
          description: translate("updateCurrentDescription"),
          durationMs: 3000,
        });
      }
      return;
    }

    const releaseUrl = appUpdateReleaseUrl(update.version);
    showToast({
      title: `${translate("updateAvailable")} ${update.version}`,
      description: update.body || translate("updateAvailableDescription"),
      durationMs: 0,
      link: {
        label: translate("updateChangelog"),
        href: releaseUrl,
        onClick: () => openExternalUrl(releaseUrl),
      },
      action: {
        label: translate("updateAndRestart"),
        onClick: () => installUpdate(update),
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
