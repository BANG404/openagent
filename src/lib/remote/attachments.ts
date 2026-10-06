import type { OpenAgentClient, OpenAgentUiCapabilities } from "$lib/openagent";
import { openBrowserUrl } from "$lib/openagent/externalUrl";
import { tr } from "$lib/i18n";
import type { ChatAttachment } from "$lib/types";

interface AttachmentOptions {
  client: Pick<
    OpenAgentClient,
    | "openWorkspacePath"
    | "readWorkspaceTextSnippet"
    | "resolveWorkspaceMedia"
    | "repairAttachmentBlob"
    | "uploadRemoteAttachment"
  >;
  activeConversationId: () => string;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
        : reject(new Error(tr("remoteAttachmentReadFailed")));
    reader.onerror = () => reject(reader.error ?? new Error(tr("remoteAttachmentReadFailed")));
    reader.readAsDataURL(file);
  });
}

function selectBrowserFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    let settled = false;
    const onFocus = () => window.setTimeout(() => finish(input.files?.[0] ?? null), 0);
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => finish(null), { once: true });
    window.addEventListener("focus", onFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** Browser-only capabilities and the lifetime of attachment preview URLs. */
export function createRemoteAttachmentController(options: AttachmentOptions) {
  const previewUrls = new Set<string>();
  let disposed = false;
  const capabilities: OpenAgentUiCapabilities = {
    async openUrl(url) {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(tr("remoteUnsupportedUrl"));
      }
      openBrowserUrl(parsed.href);
    },
    openPath: (path) => options.client.openWorkspacePath(path, options.activeConversationId()),
    readTextSnippet: (path, startLine, endLine) =>
      options.client.readWorkspaceTextSnippet(
        path,
        startLine,
        endLine,
        options.activeConversationId(),
      ),
    resolveMedia: (path, kind) =>
      options.client.resolveWorkspaceMedia(path, kind, options.activeConversationId()),
    async repairAttachment(blobId, name) {
      const file = await selectBrowserFile();
      if (!file || disposed) return false;
      await options.client.repairAttachmentBlob(blobId, name, await fileToBase64(file));
      return true;
    },
    async saveDownloadFile(filename, content, encoding) {
      const bytes =
        encoding === "base64"
          ? Uint8Array.from(atob(content), (character) => character.charCodeAt(0))
          : new TextEncoder().encode(content);
      const url = URL.createObjectURL(new Blob([bytes]));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return { location: filename };
    },
  };
  async function uploadAttachments(files: File[]): Promise<ChatAttachment[]> {
    return Promise.all(
      files.map(async (file) => {
        const attachment = await options.client.uploadRemoteAttachment(
          file.name,
          await fileToBase64(file),
        );
        if (attachment.kind !== "image" || disposed) return attachment;
        const previewUrl = URL.createObjectURL(file);
        previewUrls.add(previewUrl);
        return { ...attachment, previewUrl };
      }),
    );
  }
  function dispose() {
    disposed = true;
    for (const url of previewUrls) URL.revokeObjectURL(url);
    previewUrls.clear();
  }
  return { capabilities, uploadAttachments, dispose };
}
