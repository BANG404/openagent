import { invoke } from "$lib/openagent/tauriClient";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { dismissToast, showToast, updateToast } from "$lib/toast";

let checking = false;
let installing = false;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function updateProgressMessage(event: DownloadEvent, downloadedBytes: number, totalBytes?: number): string {
  if (event.event === "Started") {
    return "正在下载更新包...";
  }
  if (event.event === "Finished") {
    return "正在安装更新...";
  }
  if (totalBytes && totalBytes > 0) {
    const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
    return `已下载 ${percent}%`;
  }
  return "正在下载更新包...";
}

async function installUpdate(update: Update): Promise<void> {
  if (installing) return;
  installing = true;

  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  let progressToastId: number | null = null;
  let lastProgressBucket = -1;

  try {
    progressToastId = showToast({
      title: "正在更新 OpenAgent",
      description: "正在下载更新包...",
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
          title: "正在更新 OpenAgent",
          description: updateProgressMessage(event, downloadedBytes, totalBytes),
        });
      }
    });

    showToast({
      title: "更新已安装",
      description: "OpenAgent 将重启以完成更新。",
      durationMs: 3000,
    });
    await invoke("restart_app");
  } catch (error) {
    showToast({
      title: "更新失败",
      description: describeError(error),
      variant: "error",
      durationMs: 8000,
    });
  } finally {
    if (progressToastId !== null) {
      dismissToast(progressToastId);
    }
    installing = false;
  }
}

export async function checkForAppUpdate(notifyWhenUpToDate = false): Promise<void> {
  if (checking || installing) return;
  checking = true;

  try {
    const update = await check();
    if (!update) {
      if (notifyWhenUpToDate) {
        showToast({
          title: "已是最新版本",
          description: "OpenAgent 当前已是最新版本。",
          durationMs: 3000,
        });
      }
      return;
    }

    showToast({
      title: `发现新版本 ${update.version}`,
      description: update.body || "可在应用内下载并安装更新。",
      durationMs: 0,
      action: {
        label: "更新并重启",
        onClick: () => installUpdate(update),
      },
    });
  } catch (error) {
    console.warn("[openagent] Update check failed", error);
    if (notifyWhenUpToDate) {
      showToast({
        title: "检查更新失败",
        description: describeError(error),
        variant: "error",
        durationMs: 8000,
      });
    }
  } finally {
    checking = false;
  }
}
