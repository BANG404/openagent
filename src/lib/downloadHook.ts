import { isTauri } from "@tauri-apps/api/core";
import { invoke } from "$lib/openagent/tauriClient";
import { showToast } from "$lib/toast";
import { tr } from "$lib/i18n";

export interface DownloadPayload {
  filename: string;
  content: string | Uint8Array;
  mimeType: string;
}

/** Convert a Uint8Array to a base64 string in chunks to avoid call-stack blowups on large blobs. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

function isBinaryMime(mimeType: string): boolean {
  return !/^text\/|charset|json|xml|svg|csv|markdown/i.test(mimeType);
}

async function handleDownload(payload: DownloadPayload): Promise<void> {
  const { filename, content, mimeType } = payload;
  let encoding: "base64" | "utf8";
  let body: string;
  if (content instanceof Uint8Array) {
    encoding = "base64";
    body = bytesToBase64(content);
  } else if (isBinaryMime(mimeType)) {
    encoding = "base64";
    body = content;
  } else {
    encoding = "utf8";
    body = content;
  }

  try {
    const savedPath = await invoke<string>("save_download_file", {
      filename,
      content: body,
      encoding,
    });
    showToast({
      title: tr("toastDownloadSuccess"),
      description: savedPath,
      descriptionFromEnd: true,
      variant: "success",
      action: {
        label: tr("toastOpenFile"),
        onClick: async () => {
          try {
            await invoke("open_path", { path: savedPath });
          } catch {}
        },
      },
    });
  } catch (err) {
    const msg =
      typeof err === "string" ? err : ((err as { message?: string })?.message ?? String(err));
    showToast({
      title: tr("toastDownloadFailed"),
      description: msg,
      variant: "error",
    });
  }
}

declare global {
  interface Window {
    __OPENAGENT_DOWNLOAD__?: (payload: DownloadPayload) => Promise<void> | void;
  }
}

/**
 * Install the global download hook used by the patched svelte-streamdown.
 * Returns a teardown function. Safe to call only in the Tauri context.
 */
export function installDownloadHook(): () => void {
  if (typeof window === "undefined" || !isTauri()) return () => {};
  window.__OPENAGENT_DOWNLOAD__ = handleDownload;
  return () => {
    if (window.__OPENAGENT_DOWNLOAD__ === handleDownload) {
      delete window.__OPENAGENT_DOWNLOAD__;
    }
  };
}
