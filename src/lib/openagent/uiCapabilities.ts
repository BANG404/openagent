import { getContext, setContext } from "svelte";
import { isTauri } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { tr } from "$lib/i18n";
import type { HtmlPreviewFile, WorkspaceMediaSource, WorkspaceTextSnippet } from "./contracts";
import { openSurfaceUrl } from "./externalUrl";
import { desktopOpenAgent, invoke } from "./tauriClient";

export interface SavedDownload {
  location: string;
  open?: () => Promise<void>;
}

export interface OpenAgentUiCapabilities {
  openUrl(url: string): Promise<void>;
  openPath(path: string): Promise<void>;
  readTextSnippet(path: string, startLine: number, endLine: number): Promise<WorkspaceTextSnippet>;
  resolveMedia(path: string, kind: "image" | "video"): Promise<WorkspaceMediaSource>;
  readHtmlPreview(path: string): Promise<HtmlPreviewFile>;
  repairAttachment(blobId: string, name: string): Promise<boolean>;
  saveDownloadFile(
    filename: string,
    content: string,
    encoding: "base64" | "utf8",
  ): Promise<SavedDownload>;
}

const UI_CAPABILITIES_CONTEXT = Symbol("openagent-ui-capabilities");

const desktopCapabilities: OpenAgentUiCapabilities = {
  openUrl: (url) => openSurfaceUrl(url, isTauri(), openExternalUrl),
  openPath: (path) => desktopOpenAgent.openWorkspacePath(path),
  readTextSnippet: (path, startLine, endLine) =>
    desktopOpenAgent.readWorkspaceTextSnippet(path, startLine, endLine),
  resolveMedia: (path, kind) => desktopOpenAgent.resolveWorkspaceMedia(path, kind),
  readHtmlPreview: (path) => desktopOpenAgent.readHtmlPreview(path),
  async repairAttachment(blobId, name) {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: tr("selectOriginalAttachment"),
    });
    if (typeof selected !== "string") return false;
    await invoke("repair_attachment_blob", { blobId, name, path: selected });
    return true;
  },
  async saveDownloadFile(filename, content, encoding) {
    const location = await invoke<string>("save_download_file", { filename, content, encoding });
    return {
      location,
      open: () => desktopOpenAgent.openWorkspacePath(location),
    };
  },
};

export function provideOpenAgentUiCapabilities(capabilities: OpenAgentUiCapabilities): void {
  setContext(UI_CAPABILITIES_CONTEXT, capabilities);
}

export function useOpenAgentUiCapabilities(): OpenAgentUiCapabilities {
  return (
    getContext<OpenAgentUiCapabilities | undefined>(UI_CAPABILITIES_CONTEXT) ?? desktopCapabilities
  );
}
